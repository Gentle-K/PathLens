import httpx
import json
import asyncio

async def main():
    api_key = "sk-651b78733b9f4db69a1f9da786beec50"
    base_url = "https://api.tokenpony.cn/v1"
    model = "glm-5"
    
    print(f"Calling chat completions with explicitly stream=False...")
    try:
        response = httpx.post(
            f"{base_url}/chat/completions",
            headers={"Authorization": f"Bearer {api_key}"},
            json={
                "model": model,
                "messages": [{"role": "user", "content": "You are a quantification agent. Reply with exactly '{'status': 'ok'}'"}],
                "stream": False
            },
            timeout=30.0
        )
        print(f"Status: {response.status_code}")
        print(response.text)
    except Exception as e:
        print(f"\nError: {e}")

if __name__ == "__main__":
    asyncio.run(main())
