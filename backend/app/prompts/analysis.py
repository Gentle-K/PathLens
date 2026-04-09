from __future__ import annotations

import json

from app.domain.models import AnalysisMode, AnalysisSession
from app.i18n import is_zh_locale


def _trim_text(value: str, limit: int) -> str:
    text = value.strip()
    if len(text) <= limit:
        return text
    return text[: max(0, limit - 3)].rstrip() + "..."


def _mode_name(session: AnalysisSession) -> str:
    if session.mode == AnalysisMode.MULTI_OPTION:
        return "multi_option_decision"
    return "cost_estimation"


def _mode_brief(session: AnalysisSession) -> str:
    if session.mode == AnalysisMode.MULTI_OPTION:
        return (
            "Identify the plausible solution set, compare options in parallel, "
            "and produce a recommendation that makes trade-offs explicit."
        )
    return (
        "Estimate the budget range for one plan, enumerate cost and income items, "
        "and separate direct cost, opportunity cost, and uncertainty."
    )


def _output_language(session: AnalysisSession) -> str:
    return "Chinese" if is_zh_locale(session.locale) else "English"


def build_clarification_prompts(session: AnalysisSession) -> tuple[str, str]:
    system_prompt = (
        "You are the clarification planner for a structured decision-analysis product. "
        "Generate only the highest-value questions needed before deeper analysis. "
        "Questions must be concrete, frontend-friendly, and non-redundant. "
        "Return strict JSON only."
    )

    if session.mode == AnalysisMode.MULTI_OPTION:
        task_rules = (
            "Focus on identifying candidate options, the user's real objective, "
            "hard constraints, evaluation criteria, and preference weights. "
            "If the options are ambiguous, ask directly for the option set."
        )
    else:
        task_rules = (
            "Focus on scope, budget horizon, scale, geography, must-have quality, "
            "possible revenue, and hidden costs such as opportunity cost or financing cost."
        )

    user_prompt = (
        "Return JSON with a top-level 'questions' array. "
        "Each item must contain question_text, purpose, options, allow_custom_input, allow_skip, "
        "priority, question_group, input_hint, and example_answer.\n"
        f"output_language={_output_language(session)}\n"
        f"workflow={_mode_name(session)}\n"
        f"workflow_brief={_mode_brief(session)}\n"
        f"task_rules={task_rules}\n"
        f"problem_statement={session.problem_statement}"
    )
    return system_prompt, user_prompt


def build_planning_prompts(
    session: AnalysisSession,
    *,
    compact: bool = False,
) -> tuple[str, str]:
    answer_map = {answer.question_id: answer.value for answer in session.answers}
    asked_limit = 8 if compact else len(session.clarification_questions)
    answered_limit = 8 if compact else len(session.clarification_questions)
    evidence_limit = 4 if compact else 8
    conclusion_limit = 5 if compact else 8
    fact_limit = 1 if compact else 3
    summary_limit = 140 if compact else 320
    conclusion_text_limit = 120 if compact else 240

    asked_questions = [
        {
            "question_id": question.question_id,
            "question_text": _trim_text(question.question_text, 80 if compact else 160),
            "purpose": _trim_text(question.purpose, 80 if compact else 160),
            "options": question.options[:4] if compact else question.options,
            "answered": question.question_id in answer_map or question.answered,
            "question_group": question.question_group,
        }
        for question in session.clarification_questions[-asked_limit:]
    ]
    answered_questions = [
        {
            "question_id": question.question_id,
            "question_text": _trim_text(question.question_text, 80 if compact else 160),
            "answer": _trim_text(str(answer_map[question.question_id]), 80 if compact else 180),
            "purpose": _trim_text(question.purpose, 80 if compact else 160),
            "question_group": question.question_group,
        }
        for question in session.clarification_questions
        if question.question_id in answer_map
    ][-answered_limit:]
    evidence_items = [
        {
            "title": item.title,
            "source_name": item.source_name,
            "summary": _trim_text(item.summary, summary_limit),
            "facts": [_trim_text(fact, summary_limit) for fact in item.extracted_facts[:fact_limit]],
            "confidence": item.confidence,
        }
        for item in session.evidence_items[-evidence_limit:]
    ]
    conclusions = [
        {
            "content": _trim_text(item.content, conclusion_text_limit),
            "conclusion_type": item.conclusion_type,
            "basis_refs": item.basis_refs,
            "confidence": item.confidence,
        }
        for item in session.major_conclusions[-conclusion_limit:]
    ]

    system_prompt = (
        "You are the round planner for a multi-step decision workflow. "
        "For each round, decide whether the system should ask follow-up questions, "
        "run external searches, schedule deterministic calculations, prepare charts, "
        "or stop and move to the final report. "
        "Return strict JSON only and avoid repeating low-value questions."
    )

    if session.mode == AnalysisMode.MULTI_OPTION:
        mode_rules = (
            "Prefer questions or tasks that sharpen the option set, validate differences between options, "
            "or clarify what trade-offs the user truly values. "
            "When enough evidence exists, the final report must compare options side by side."
        )
    else:
        mode_rules = (
            "Prefer questions or tasks that reduce budget uncertainty, uncover hidden cost drivers, "
            "validate revenue assumptions, or make the final budget range more decision-useful. "
            "When enough evidence exists, the report should produce a structured budget estimate."
        )

    user_prompt = (
        "Return JSON with keys: clarification_questions, search_tasks, calculation_tasks, chart_tasks, "
        "major_conclusions, ready_for_report, reasoning_focus, stop_reason.\n"
        "clarification_questions items must contain question_text, purpose, options, "
        "allow_custom_input, allow_skip, priority, question_group, input_hint, and example_answer.\n"
        "search_tasks items must contain search_topic, search_goal, search_scope, suggested_queries, "
        "required_fields, freshness_requirement, task_group, and notes.\n"
        "calculation_tasks items must contain objective, formula_hint, input_params, and unit.\n"
        "chart_tasks items must contain objective, chart_type, title, source_task_ids, preferred_unit, and notes.\n"
        "major_conclusions items must contain content, conclusion_type, basis_refs, and confidence.\n"
        "Rules:\n"
        "1. Never repeat a question that was already asked, even if wording could be changed slightly.\n"
        "2. Ask only the minimum questions needed to change the recommendation or the evidence plan.\n"
        "3. If user facts are mostly sufficient but external facts are weak, prefer search_tasks.\n"
        "4. Use calculation_tasks only when deterministic arithmetic would materially improve the output.\n"
        "5. Use chart_tasks only when a comparison or breakdown would be easier to understand visually.\n"
        "6. If the current information is sufficient for a bounded recommendation, set ready_for_report=true.\n"
        "7. reasoning_focus should name the single most important unresolved dimension.\n"
        "8. stop_reason should explain why the workflow should pause for user input, run tools, or finish.\n"
        f"output_language={_output_language(session)}\n"
        f"context_profile={'compact' if compact else 'full'}\n"
        f"workflow={_mode_name(session)}\n"
        f"workflow_brief={_mode_brief(session)}\n"
        f"mode_rules={mode_rules}\n"
        f"problem_statement={session.problem_statement}\n"
        f"analysis_rounds_completed={session.analysis_rounds_completed}\n"
        f"follow_up_round_limit={session.follow_up_round_limit}\n"
        f"follow_up_rounds_used={session.follow_up_rounds_used}\n"
        "asked_questions_json="
        + json.dumps(asked_questions, ensure_ascii=False)
        + "\nanswered_questions_json="
        + json.dumps(answered_questions, ensure_ascii=False)
        + "\nexisting_evidence_json="
        + json.dumps(evidence_items, ensure_ascii=False)
        + "\nexisting_major_conclusions_json="
        + json.dumps(conclusions, ensure_ascii=False)
    )
    return system_prompt, user_prompt


def build_reporting_prompts(session: AnalysisSession) -> tuple[str, str]:
    evidence_items = [
        {
            "title": item.title,
            "source_name": item.source_name,
            "summary": item.summary,
            "facts": item.extracted_facts[:3],
            "confidence": item.confidence,
        }
        for item in session.evidence_items[-10:]
    ]
    conclusions = [
        {
            "content": item.content,
            "conclusion_type": item.conclusion_type,
            "basis_refs": item.basis_refs,
            "confidence": item.confidence,
        }
        for item in session.major_conclusions
    ]
    calculations = [
        {
            "objective": task.objective,
            "formula_hint": task.formula_hint,
            "unit": task.unit,
            "result_value": task.result_value,
            "result_text": task.result_text,
            "result_payload": task.result_payload,
            "status": task.status,
        }
        for task in session.calculation_tasks
    ]

    system_prompt = (
        "You are the final-report writer for a structured decision-analysis product. "
        "Write a concise but highly actionable report. "
        "Separate facts, estimates, assumptions, trade-offs, and recommendations. "
        "Return strict JSON only."
    )

    if session.mode == AnalysisMode.MULTI_OPTION:
        mode_requirements = (
            "Return JSON with summary, assumptions, recommendations, open_questions, markdown, option_profiles, and tables.\n"
            "option_profiles items must contain name, summary, pros, cons, conditions, fit_for, caution_flags, "
            "estimated_cost_low, estimated_cost_base, estimated_cost_high, currency, score, confidence, and basis_refs.\n"
            "tables should include at least one comparison matrix with parallel rows for each option.\n"
            "The markdown must end in a clear decision posture and explain when each option becomes preferable."
        )
    else:
        mode_requirements = (
            "Return JSON with summary, assumptions, recommendations, open_questions, markdown, budget_summary, budget_items, and tables.\n"
            "budget_summary must contain currency, total_cost_low, total_cost_base, total_cost_high, total_income_low, "
            "total_income_base, total_income_high, net_low, net_base, net_high, and reserve_note.\n"
            "budget_items items must contain name, category, item_type, low, base, high, currency, rationale, basis_refs, and confidence.\n"
            "tables should include a detailed budget breakdown and make room for income or offsetting revenue when relevant.\n"
            "The markdown must state the recommended budget range first and call out hidden or indirect cost sources."
        )

    user_prompt = (
        "Requirements:\n"
        "1. summary must state the recommendation or decision posture first.\n"
        "2. recommendations must be concrete next actions.\n"
        "3. markdown should read like a polished result page narrative, not raw notes.\n"
        "4. Prefer bounded estimates over vague statements whenever numbers are available.\n"
        "5. Tables should use consistent column names and plain JSON row objects.\n"
        "6. Keep open_questions short; do not let them dominate the report.\n"
        f"output_language={_output_language(session)}\n"
        f"workflow={_mode_name(session)}\n"
        f"workflow_brief={_mode_brief(session)}\n"
        f"problem_statement={session.problem_statement}\n"
        f"status={session.status.value}\n"
        f"analysis_rounds_completed={session.analysis_rounds_completed}\n"
        + mode_requirements
        + "\nmajor_conclusions_json="
        + json.dumps(conclusions, ensure_ascii=False)
        + "\nevidence_json="
        + json.dumps(evidence_items, ensure_ascii=False)
        + "\ncalculations_json="
        + json.dumps(calculations, ensure_ascii=False)
    )
    return system_prompt, user_prompt
