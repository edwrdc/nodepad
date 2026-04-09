"use client"

import { getBaseUrl, getProviderHeaders, type AIConfig } from "@/lib/ai-settings"

export interface AIChatMessage {
  role: "system" | "user"
  content: string
}

export interface AIRequestOptions {
  config: AIConfig
  model: string
  messages: AIChatMessage[]
  responseFormat?: { type: "json_schema"; json_schema: unknown } | { type: "json_object" }
  temperature?: number
  webSearchOptions?: Record<string, unknown>
  maxOutputTokens?: number
}

export interface AITextResult {
  text: string
  annotations?: Array<{ type: string; url_citation?: { url: string; title?: string } }>
}

function unsupportedFamily(family: never): never {
  throw new Error(`Unsupported AI provider API family: ${family}`)
}

export async function requestAIText(options: AIRequestOptions): Promise<AITextResult> {
  switch (options.config.apiFamily) {
    case "openai-completions":
      return requestOpenAICompatibleText(options)
    case "anthropic-messages":
      return requestAnthropicText(options)
    default:
      return unsupportedFamily(options.config.apiFamily as never)
  }
}

async function requestOpenAICompatibleText({
  config,
  model,
  messages,
  responseFormat,
  temperature,
  webSearchOptions,
}: AIRequestOptions): Promise<AITextResult> {
  const body: Record<string, unknown> = {
    model,
    messages,
  }

  if (webSearchOptions === undefined) {
    if (responseFormat) body.response_format = responseFormat
    if (temperature !== undefined) body.temperature = temperature
  } else {
    body.web_search_options = webSearchOptions
  }

  const response = await fetch(`${getBaseUrl(config)}/chat/completions`, {
    method: "POST",
    headers: getProviderHeaders(config),
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`AI request error (${config.provider}) ${response.status}: ${err}`)
  }

  let data: Record<string, unknown>
  try {
    data = await response.json()
  } catch {
    throw new Error(
      `AI request error (${config.provider}): response was not valid JSON. The provider may have timed out or returned a truncated response.`
    )
  }

  const choice = (data.choices as Array<{ message?: { content?: string; annotations?: unknown[] } }>)?.[0]
  const text = choice?.message?.content
  if (!text) throw new Error("No content in AI response")

  const annotations = (choice.message?.annotations ?? []) as Array<{ type: string; url_citation?: { url: string; title?: string } }>
  return { text, annotations }
}

async function requestAnthropicText({
  config,
  model,
  messages,
  temperature,
  maxOutputTokens,
}: AIRequestOptions): Promise<AITextResult> {
  const system = messages.filter(m => m.role === "system").map(m => m.content).join("\n\n").trim()
  const userContent = messages.filter(m => m.role === "user").map(m => m.content).join("\n\n").trim()

  if (!userContent) {
    throw new Error("Anthropic-style requests require user content")
  }

  const response = await fetch("/api/ai/anthropic", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      provider: config.provider,
      apiKey: config.apiKey,
      model,
      system,
      userContent,
      temperature,
      maxTokens: maxOutputTokens ?? 2048,
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`AI request error (${config.provider}) ${response.status}: ${err}`)
  }

  let data: Record<string, unknown>
  try {
    data = await response.json()
  } catch {
    throw new Error(
      `AI request error (${config.provider}): response was not valid JSON. The provider may have timed out or returned a truncated response.`
    )
  }

  const content = ((data.content as Array<{ type?: string; text?: string }> | undefined) ?? [])
    .filter(block => block.type === "text" && typeof block.text === "string")
    .map(block => block.text ?? "")
    .join("\n")
    .trim()

  if (!content) throw new Error("No content in AI response")

  return { text: content }
}
