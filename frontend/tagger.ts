export class AzureTagger {
  constructor(
    private apiKey: string,
    private apiUrl: string,
  ) {
  }

  async getTags(description: string, options?: { maxTags?: number; candidates?: string[] }): Promise<string[]> {
    const prompt = `分析描述并返回最合适的${options?.maxTags || 3}个标签.
${options?.candidates ? `候选标签限制: ${options.candidates.join(", ")}` : ""}
输出格式必须为严格的json数组: ["Tag1", "Tag2"]。

描述內容：
"${description}"`;

    const payload = {
      messages: [
        { role: "system", content: "You are a professional categorization tool. Output ONLY a JSON array of strings." },
        { role: "user", content: prompt }
      ],
      temperature: 0.3,
      // 確保返回格式
      response_format: { type: "json_object" }
    };

    const response = await fetch(this.apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": this.apiKey
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Azure API Error: ${JSON.stringify(error)}`);
    }

    const data = await response.json();
    const rawContent = data.choices[0].message.content;

    try {
      // 解析 AI 返回的 JSON 字符串
      const parsed = JSON.parse(rawContent);
      return Array.isArray(parsed) ? parsed : (parsed.tags || Object.values(parsed)[0]);
    } catch {
      return [];
    }
  }
}
