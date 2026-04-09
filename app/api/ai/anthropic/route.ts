import { NextRequest, NextResponse } from "next/server"

type AnthropicProxyRequest = {
  provider?: string
  apiKey?: string
  model?: string
  system?: string
  userContent?: string
  temperature?: number
  maxTokens?: number
}

const PROVIDER_BASE_URLS: Record<string, string> = {
  "kimi-coding": "https://api.kimi.com/coding",
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as AnthropicProxyRequest

    const provider = String(body.provider ?? "")
    const apiKey = String(body.apiKey ?? "")
    const model = String(body.model ?? "")
    const userContent = String(body.userContent ?? "")
    const system = typeof body.system === "string" ? body.system : ""
    const temperature = typeof body.temperature === "number" ? body.temperature : undefined
    const maxTokens = typeof body.maxTokens === "number" ? body.maxTokens : 2048

    const baseUrl = PROVIDER_BASE_URLS[provider]

    if (!baseUrl) {
      return NextResponse.json({ error: `Unsupported Anthropic-style provider: ${provider}` }, { status: 400 })
    }

    if (!apiKey || !model || !userContent) {
      return NextResponse.json({ error: "Missing required AI request fields" }, { status: 400 })
    }

    const upstreamBody: Record<string, unknown> = {
      model,
      max_tokens: maxTokens,
      messages: [{ role: "user", content: userContent }],
    }

    if (system.trim()) upstreamBody.system = system
    if (temperature !== undefined) upstreamBody.temperature = temperature

    const response = await fetch(`${baseUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(upstreamBody),
      cache: "no-store",
    })

    const text = await response.text()

    return new NextResponse(text, {
      status: response.status,
      headers: {
        "Content-Type": response.headers.get("content-type") || "application/json",
        "Cache-Control": "no-store",
      },
    })
  } catch {
    return NextResponse.json({ error: "Anthropic proxy request failed" }, { status: 500 })
  }
}
