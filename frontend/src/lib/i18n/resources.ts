import type { Resource } from 'i18next'

export const resources = {
  zh: {
    translation: {
      app: {
        name: 'Genius Actuary',
        tagline: '面向高价值个人决策的 AI 分析工作台',
        workspaceEyebrow: '分析工作台',
        workspaceTitle: '专业黑金决策控制台',
        anonymousUser: '访客用户',
        anonymousSession: '匿名分析会话',
        adapterFooterTitle: '已接入后端的前端工程',
        adapterFooterDetail:
          '分析主链路已对接 FastAPI，会话通过浏览器 Cookie 隔离，无需额外 API Key。',
      },
      roles: {
        analyst: '分析员',
        admin: '管理员',
        reviewer: '审核员',
      },
      common: {
        save: '保存',
        cancel: '取消',
        confirm: '确认',
        continue: '继续',
        create: '创建',
        update: '更新',
        export: '导出',
        loading: '加载中',
        search: '搜索',
        viewAll: '查看全部',
        system: '跟随系统',
        dark: '黑金暗色',
        light: '浅色主题',
        noData: '暂无数据',
        reset: '重置',
        details: '详情',
        upload: '上传',
        preview: '预览',
        delete: '删除',
        back: '返回',
        language: '语言',
        theme: '主题',
        highPriority: '高优先级',
        selected: '已选中',
        choose: '选择',
        nextStep: '下一步',
        status: {
          INIT: '已创建',
          CLARIFYING: '待补充信息',
          ANALYZING: '分析中',
          READY_FOR_REPORT: '待生成报告',
          REPORTING: '正在组装报告',
          COMPLETED: '已完成',
          FAILED: '失败',
        },
        tone: {
          positive: '进展良好',
          warning: '需要关注',
          neutral: '信息更新',
        },
      },
      nav: {
        dashboard: '决策总览',
        analyze: '发起分析',
        notifications: '通知中心',
        logs: '日志审计',
        files: '文件中心',
        dataviz: '数据可视化',
        resources: '历史分析记录',
        settings: '设置',
        profile: '个人资料',
        admin: '角色管理',
      },
      auth: {
        signIn: '登录工作台',
        email: '邮箱',
        password: '密码',
        mfaCode: 'MFA 验证码',
        helper: '演示账号：analyst@geniusactuary.ai / password123 / 123456',
        restHelper:
          '当前后端使用匿名 Cookie 会话。点击一次即可建立会话并进入工作台。',
        restDetail:
          '当前已接入本地 FastAPI 后端。分析会话通过浏览器 Cookie 识别，不需要额外填写 API Key 或 Bearer Token。',
        restAction: '连接后端并进入工作台',
        restPending: '正在连接后端...',
      },
      dashboard: {
        eyebrow: '总览',
        title: '决策总览',
        subtitle: '近期分析、关键指标、趋势、活动记录与快捷入口。',
        recentAnalyses: '近期分析',
        activityPulse: '活动脉冲',
        openReport: '打开报告',
        continueAnalysis: '继续分析',
        metrics: {
          activeSessions: {
            label: '进行中的分析',
            detail: '仍需补充信息或等待推进的分析会话。',
            change: '今日 +2',
          },
          reportsExported: {
            label: '已完成报告',
            detail: '已形成结构化图表与证据链的报告。',
            change: '+18%',
          },
          unreadAlerts: {
            label: '未读提醒',
            detail: '仍需在工作流中关注的系统提醒。',
            change: '实时',
          },
          confidenceTrend: {
            label: '信心趋势',
            detail: '近期决策报告的综合质量信号。',
            change: '+6 分',
          },
          trackedSessions: {
            label: '后端跟踪会话',
            detail: '当前浏览器里已连接真实后端的分析会话数。',
          },
          completedLoops: {
            label: '已闭环会话',
            detail: '已经在后端完成一轮分析闭环的会话。',
          },
          needInput: {
            label: '等待补充信息',
            detail: '仍需用户继续回答追问的会话。',
          },
        },
        activity: {
          exchangeComplete: {
            title: '交换项目报告已完成',
            detail: 'Markdown 报告、指标卡和图表包已同步。',
          },
          clarifyWaiting: {
            title: '有一轮追问等待补充',
            detail: '研究生/工作决策仍需补充资金确定性。',
          },
          fileIndexed: {
            title: '成本敏感性文件已入库',
            detail: '通勤成本 CSV 已可用于可视化分析。',
          },
          backendSync: {
            title: '后端契约已同步',
            detail: '前端现已连通本地 FastAPI 后端，会话通过 Cookie 隔离。',
          },
        },
        charts: {
          confidenceTrendTitle: '近期报告信心趋势',
          confidenceTrendNote: '基于证据覆盖度的滚动信心变化。',
          workflowMixTitle: '不同工作流下的报告分布',
        },
      },
      analysis: {
        modeTitle: '选择分析模式',
        modeSubtitle: '先明确本轮分析的工作方式，再进入问题输入和结构化追问。',
        modeGuide:
          '请先点选一个模式。选中后会高亮显示，并明确告诉你下一步要做什么。',
        modeSelected: '当前已选模式',
        modeActionSelect: '先选这个模式',
        modeActionContinue: '用这个模式继续',
        modeActionHint: '点选后会进入问题输入页，并生成对应的追问结构。',
        intakeTitle: '问题输入工作台',
        intakeSubtitle:
          '把你的问题讲清楚，后端会根据描述决定后续追问与分析路径。',
        clarifyTitle: '结构化补充信息',
        clarifySubtitle:
          '逐条补齐关键事实、约束和偏好，让后端能更稳地推进分析。',
        clarifyHint:
          '每个问题都写明了“为什么要问”。点击选项后会立即显示选中状态，你也可以自定义、跳过或标记不确定。',
        progressTitle: '分析进行中',
        progressSubtitle: '后端正在逐阶段整理事实、证据和报告内容。',
        reportTitle: '最终报告',
        reportSubtitle:
          '报告区会把结论、依据、图表、计算与免责声明组织成完整阅读流。',
        singleMode: '单项成本 / 风险分析',
        multiMode: '多选项决策参考',
        singleDescription:
          '适合评估一个具体计划是否值得推进，重点看成本、风险、前提与执行条件。',
        multiDescription:
          '适合比较多个方案的优劣和适配度，重点看权衡、偏好匹配与证据支持。',
        singleValueLens: ['成本', '风险', '约束', '假设'],
        multiValueLens: ['方案对比', '权衡取舍', '偏好匹配', '证据支撑'],
        startAnalysis: '开始分析',
        generateReport: '查看最终报告',
        whyThisMatters: '为什么要问',
        skip: '跳过',
        uncertain: '不确定',
        decline: '暂不回答',
        customInput: '自定义补充',
        suggestions: '示例问题',
        problemStatementLabel: '问题描述',
        problemStatementPlaceholder:
          '请描述你的决策场景、候选方案、核心约束和不确定因素。',
        switchMode: '切换模式',
        suggestionHint1: '尽量写清楚“要做什么决策、有哪些备选、你最在意什么”。',
        suggestionHint2:
          '真实后端会根据问题自动生成追问，而不是前端硬编码流程。',
        suggestionHint3: '工作台始终保持统一的黑金视觉和稳定的分析节奏。',
        chooseOne: '请选择一个最接近的选项',
        chooseMany: '可多选，建议先选最重要的几项',
        selectedAnswer: '当前已选',
        reportEvidenceTitle: '依据与假设',
        reportEvidenceHint:
          '请把事实、估算和推断分开理解，再决定是否执行不可逆动作。',
        reportReopenClarification: '返回补充信息',
        reportCalculations: '计算结果',
        reportEvidenceTrail: '证据链',
        reportFallback: '当前会话存在，但报告尚未就绪，请继续推进分析流程。',
        progressStageTitle: '阶段进度',
        progressReadyHint: '报告核心内容已收敛，可以进入最终阅读视图。',
      },
      settings: {
        title: '偏好与连接设置',
        subtitle: '统一管理主题、语言、通知、API 模式与显示偏好。',
      },
      profile: {
        title: '个人资料',
        subtitle: '账户信息、历史会话、偏好与导出记录。',
      },
      admin: {
        title: '权限与角色管理',
        subtitle: '统一查看角色权限矩阵与用户分配情况。',
      },
      notifications: {
        title: '通知中心',
        subtitle: '实时事件、系统提醒与分析进度通知。',
      },
      logs: {
        title: '日志与审计',
        subtitle: '查看可追踪的链路日志、筛选条件与详情。',
      },
      files: {
        title: '文件管理',
        subtitle: '上传、预览与监控报告、证据和附件。',
      },
      dataviz: {
        title: '数据可视化',
        subtitle: '统一的黑金图表系统，兼顾展示与导出。',
      },
      resources: {
        title: '历史分析记录',
        subtitle: '查看当前浏览器下的分析记录与最近进度。',
      },
    },
  },
  en: {
    translation: {
      app: {
        name: 'Genius Actuary',
        tagline: 'AI decision analysis workspace for high-stakes choices',
        workspaceEyebrow: 'Analysis Workspace',
        workspaceTitle: 'Professional black-gold control surface',
        anonymousUser: 'Visitor',
        anonymousSession: 'Anonymous analysis session',
        adapterFooterTitle: 'Backend-connected frontend',
        adapterFooterDetail:
          'The main analysis flow is connected to FastAPI and isolated by browser cookie sessions.',
      },
      roles: {
        analyst: 'Analyst',
        admin: 'Admin',
        reviewer: 'Reviewer',
      },
      common: {
        save: 'Save',
        cancel: 'Cancel',
        confirm: 'Confirm',
        continue: 'Continue',
        create: 'Create',
        update: 'Update',
        export: 'Export',
        loading: 'Loading',
        search: 'Search',
        viewAll: 'View all',
        system: 'System',
        dark: 'Obsidian',
        light: 'Light',
        noData: 'No data available',
        reset: 'Reset',
        details: 'Details',
        upload: 'Upload',
        preview: 'Preview',
        delete: 'Delete',
        back: 'Back',
        language: 'Language',
        theme: 'Theme',
        highPriority: 'High priority',
        selected: 'Selected',
        choose: 'Choose',
        nextStep: 'Next step',
        status: {
          INIT: 'Created',
          CLARIFYING: 'Needs clarification',
          ANALYZING: 'Analyzing',
          READY_FOR_REPORT: 'Ready for report',
          REPORTING: 'Building report',
          COMPLETED: 'Completed',
          FAILED: 'Failed',
        },
        tone: {
          positive: 'Positive',
          warning: 'Needs attention',
          neutral: 'Update',
        },
      },
      nav: {
        dashboard: 'Dashboard',
        analyze: 'New analysis',
        notifications: 'Notifications',
        logs: 'Logs & Audit',
        files: 'File Manager',
        dataviz: 'Data Visualization',
        resources: 'Analysis History',
        settings: 'Settings',
        profile: 'Profile',
        admin: 'Role Management',
      },
      auth: {
        signIn: 'Sign in to the workspace',
        email: 'Email',
        password: 'Password',
        mfaCode: 'MFA code',
        helper: 'Demo account: analyst@geniusactuary.ai / password123 / 123456',
        restHelper:
          'The current backend uses anonymous cookie-based sessions. Click once to enter the workspace.',
        restDetail:
          'The local FastAPI backend is already wired in. Browser cookies identify the session, so no extra API key or Bearer token is required here.',
        restAction: 'Connect backend and enter workspace',
        restPending: 'Connecting backend...',
      },
      dashboard: {
        eyebrow: 'Overview',
        title: 'Decision overview',
        subtitle:
          'Recent analyses, signals, trends, activity, and quick actions.',
        recentAnalyses: 'Recent analyses',
        activityPulse: 'Activity pulse',
        openReport: 'Open report',
        continueAnalysis: 'Continue analysis',
        metrics: {
          activeSessions: {
            label: 'Active sessions',
            detail: 'Analyses still waiting for clarification or progress.',
            change: '+2 today',
          },
          reportsExported: {
            label: 'Completed reports',
            detail: 'Reports with structured charts and evidence trails.',
            change: '+18%',
          },
          unreadAlerts: {
            label: 'Unread alerts',
            detail: 'Notifications that should still surface in the workflow.',
            change: 'Real-time',
          },
          confidenceTrend: {
            label: 'Confidence trend',
            detail: 'Composite quality signal across recent decision reports.',
            change: '+6 pts',
          },
          trackedSessions: {
            label: 'Tracked backend sessions',
            detail: 'Real backend sessions currently known in this browser.',
          },
          completedLoops: {
            label: 'Completed loops',
            detail: 'Sessions that already closed the backend loop.',
          },
          needInput: {
            label: 'Need user input',
            detail: 'Sessions still waiting for clarification answers.',
          },
        },
        activity: {
          exchangeComplete: {
            title: 'Exchange report finalized',
            detail: 'Markdown, KPI blocks, and chart bundle synchronized.',
          },
          clarifyWaiting: {
            title: 'A clarification round is waiting',
            detail:
              'The graduate-school decision still needs funding certainty.',
          },
          fileIndexed: {
            title: 'Sensitivity file indexed',
            detail: 'The commute sensitivity CSV is ready for visualization.',
          },
          backendSync: {
            title: 'Backend contract synced',
            detail:
              'The frontend is now wired to the local FastAPI backend via cookie sessions.',
          },
        },
        charts: {
          confidenceTrendTitle: 'Recent report confidence trend',
          confidenceTrendNote: 'Rolling confidence based on evidence coverage.',
          workflowMixTitle: 'Report mix by workflow',
        },
      },
      analysis: {
        modeTitle: 'Choose an analysis mode',
        modeSubtitle:
          'Select the workflow first, then move into intake and structured clarification.',
        modeGuide:
          'Select one mode first. The chosen card will highlight and make the next action explicit.',
        modeSelected: 'Currently selected',
        modeActionSelect: 'Choose this mode',
        modeActionContinue: 'Use this mode',
        modeActionHint:
          'After selection, you will move into prompt intake and get a mode-specific clarification flow.',
        intakeTitle: 'Prompt intake workbench',
        intakeSubtitle:
          'Describe the problem clearly and let the backend decide the follow-up structure.',
        clarifyTitle: 'Structured clarification',
        clarifySubtitle:
          'Complete the missing facts, constraints, and preferences before the backend continues.',
        clarifyHint:
          'Each question explains why it matters. Clicking an option should immediately show a selected state, and you can still add custom context, skip, or mark it uncertain.',
        progressTitle: 'Analysis in progress',
        progressSubtitle:
          'The backend is currently organizing facts, evidence, and report content by stage.',
        reportTitle: 'Final report',
        reportSubtitle:
          'The report area assembles conclusions, evidence, charts, calculations, and disclaimers into one reading flow.',
        singleMode: 'Single option cost / risk',
        multiMode: 'Multi-option decision reference',
        singleDescription:
          'Use this when you need to judge whether one specific plan is worth pushing forward.',
        multiDescription:
          'Use this when you need to compare several paths and weigh trade-offs deliberately.',
        singleValueLens: ['Cost', 'Risk', 'Constraints', 'Assumptions'],
        multiValueLens: [
          'Comparison',
          'Trade-offs',
          'Preference fit',
          'Evidence',
        ],
        startAnalysis: 'Start analysis',
        generateReport: 'Open final report',
        whyThisMatters: 'Why this matters',
        skip: 'Skip',
        uncertain: 'Uncertain',
        decline: 'Prefer not to answer',
        customInput: 'Custom input',
        suggestions: 'Example prompts',
        problemStatementLabel: 'Problem statement',
        problemStatementPlaceholder:
          'Describe the decision, candidate options, key constraints, and uncertainty.',
        switchMode: 'Switch mode',
        suggestionHint1:
          'Describe the decision, the alternatives, and what matters most to you.',
        suggestionHint2:
          'The real backend generates the clarification steps instead of the frontend hardcoding them.',
        suggestionHint3:
          'The workspace keeps one consistent black-gold language across every module.',
        chooseOne: 'Choose the single most fitting option',
        chooseMany: 'Multiple selection is allowed',
        selectedAnswer: 'Current selection',
        reportEvidenceTitle: 'Evidence & assumptions',
        reportEvidenceHint:
          'Separate facts, estimates, and inferences before making an irreversible move.',
        reportReopenClarification: 'Back to clarification',
        reportCalculations: 'Calculation outputs',
        reportEvidenceTrail: 'Evidence trail',
        reportFallback:
          'The session exists, but the report bundle is not ready yet.',
        progressStageTitle: 'Stage progression',
        progressReadyHint:
          'The report core has converged. You can open the final reading flow now.',
      },
      settings: {
        title: 'Preferences & connectivity',
        subtitle:
          'Manage theme, language, notifications, API mode, and display settings.',
      },
      profile: {
        title: 'User profile',
        subtitle: 'Account details, session history, exports, and preferences.',
      },
      admin: {
        title: 'Admin & role management',
        subtitle: 'Inspect role matrices and user assignments in one system.',
      },
      notifications: {
        title: 'Notifications',
        subtitle:
          'Real-time events, system alerts, and analysis progress signals.',
      },
      logs: {
        title: 'Logs & audit',
        subtitle:
          'Traceable chain logs with filters, exports, and detail views.',
      },
      files: {
        title: 'File manager',
        subtitle:
          'Upload, preview, and monitor reports, evidence, and attachments.',
      },
      dataviz: {
        title: 'Data visualization',
        subtitle:
          'Unified black-and-gold chart system with export-ready states.',
      },
      resources: {
        title: 'Analysis History',
        subtitle:
          'Review this browser’s saved analyses and their latest progress.',
      },
    },
  },
} satisfies Resource
