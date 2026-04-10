import asyncio
import os
import sys

# Let's ensure the path is set up to import app
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.config import Settings, load_local_env
from app.adapters.llm_analysis import OpenAICompatibleAnalysisAdapter
from app.domain.models import AnalysisSession
from app.domain.rwa import RwaIntakeContext

async def main():
    load_local_env()
    settings = Settings.from_env()

    # Create dummy session
    session = AnalysisSession(
        id="test-123",
        mode="single_decision",
        problemStatement="Help me allocate 10k USDT.",
        intake_context=RwaIntakeContext(
            investmentAmount=10000,
            baseCurrency="USDT",
            preferredAssetIds=[],
            holdingPeriodDays=30,
            riskTolerance="balanced",
            liquidityNeed="t_plus_3",
            minimumKycLevel=0,
            walletAddress="",
            walletNetwork="",
            walletKycLevelOnchain=None,
            walletKycVerified=None,
            wantsOnchainAttestation=True,
            additionalConstraints="",
        )
    )

    adapter = OpenAICompatibleAnalysisAdapter(
        provider=settings.analysis_provider,
        base_url=settings.analysis_api_base_url,
        api_key=settings.analysis_api_key,
        model=settings.analysis_model,
        timeout_seconds=settings.analysis_timeout_seconds,
        retry_attempts=settings.analysis_retry_attempts,
    )

    print(f"Base URL: {settings.analysis_api_base_url}")
    print(f"Model: {settings.analysis_model}")
    print(f"API Key: {settings.analysis_api_key[:5]}...{settings.analysis_api_key[-5:]}")

    try:
        print("Testing clarification...")
        result = await adapter.generate_clarification_insight(session)
        print("SUCCESS!")
        print(result)
    except Exception as e:
        print(f"ERROR: {e}")

if __name__ == "__main__":
    asyncio.run(main())
