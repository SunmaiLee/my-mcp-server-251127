import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { InferenceClient } from '@huggingface/inference'
import { z } from 'zod'

// 설정 스키마 정의 (Smithery에서 사용자 설정 폼 자동 생성)
export const configSchema = z.object({
    hfToken: z.string().describe('Hugging Face API 토큰 (이미지 생성 기능에 필요)')
})

// 언어별 인사말 매핑
const greetings: Record<string, string> = {
    korean: '안녕하세요',
    english: 'Hello',
    japanese: 'こんにちは',
    chinese: '你好',
    spanish: 'Hola',
    french: 'Bonjour',
    german: 'Hallo',
    italian: 'Ciao',
    portuguese: 'Olá',
    russian: 'Привет'
}

// Smithery 요구사항: createServer 함수를 default export
export default function createServer({ config }: { config: z.infer<typeof configSchema> }) {
    // Hugging Face 클라이언트 초기화 (config에서 토큰 받음)
    const hfClient = new InferenceClient(config.hfToken)

    // Create server instance
    const server = new McpServer({
        name: 'My MCP Server',
        version: '1.0.0',
        capabilities: {
            tools: {}
        }
    })

    // greeting 도구 등록
    server.registerTool(
        'greeting',
        {
            title: 'Greeting Tool',
            description: '사용자 이름과 언어를 입력받아 해당 언어로 인사말을 반환합니다',
            inputSchema: {
                name: z.string().describe('인사할 대상의 이름'),
                language: z.string().describe('인사말 언어 (korean, english, japanese, chinese, spanish, french, german, italian, portuguese, russian)')
            },
            outputSchema: {
                greeting: z.string()
            }
        },
        async ({ name, language }) => {
            const lang = language.toLowerCase()
            const greetingWord = greetings[lang] || greetings['english']
            const message = `${greetingWord}, ${name}!`
            
            const output = { greeting: message }
            return {
                content: [{ type: 'text', text: message }],
                structuredContent: output
            }
        }
    )

    // calc 도구 등록
    server.registerTool(
        'calc',
        {
            title: 'Calculator Tool',
            description: '두 개의 숫자와 연산자를 입력받아 계산 결과를 반환합니다',
            inputSchema: {
                num1: z.number().describe('첫 번째 숫자'),
                num2: z.number().describe('두 번째 숫자'),
                operator: z.enum(['+', '-', '*', '/']).describe('연산자 (+, -, *, /)')
            },
            outputSchema: {
                result: z.number()
            }
        },
        async ({ num1, num2, operator }) => {
            let result: number

            switch (operator) {
                case '+':
                    result = num1 + num2
                    break
                case '-':
                    result = num1 - num2
                    break
                case '*':
                    result = num1 * num2
                    break
                case '/':
                    if (num2 === 0) {
                        return {
                            content: [{ type: 'text', text: '오류: 0으로 나눌 수 없습니다' }],
                            isError: true
                        }
                    }
                    result = num1 / num2
                    break
            }

            const message = `${num1} ${operator} ${num2} = ${result}`
            return {
                content: [{ type: 'text', text: message }],
                structuredContent: { result }
            }
        }
    )

    // ==================== Prompts ====================

    // code_review 프롬프트 등록
    server.registerPrompt(
        'code_review',
        {
            title: 'Code Review Prompt',
            description: '코드를 입력받아 코드 리뷰를 수행하는 프롬프트입니다',
            argsSchema: {
                code: z.string().describe('리뷰할 코드'),
                language: z.string().optional().describe('프로그래밍 언어 (예: typescript, python, java)')
            }
        },
        ({ code, language }) => {
            const langInfo = language ? `이 코드는 ${language}로 작성되었습니다.\n\n` : ''
            
            return {
                messages: [
                    {
                        role: 'user',
                        content: {
                            type: 'text',
                            text: `다음 코드를 리뷰해주세요. 아래 항목들을 중점적으로 검토해주세요:

1. 🐛 **버그 및 오류**: 잠재적인 버그나 런타임 오류가 있는지 확인
2. 🔒 **보안 취약점**: 보안 관련 문제점이 있는지 검토
3. ⚡ **성능 최적화**: 성능을 개선할 수 있는 부분 제안
4. 📖 **가독성**: 코드의 가독성과 유지보수성 평가
5. 🏗️ **설계 패턴**: 더 나은 설계 패턴이나 구조 제안
6. ✅ **베스트 프랙티스**: 해당 언어의 모범 사례 준수 여부

${langInfo}리뷰할 코드:
\`\`\`
${code}
\`\`\`

각 항목에 대해 구체적인 피드백과 개선 제안을 해주세요.`
                        }
                    }
                ]
            }
        }
    )

    // ==================== Resources ====================

    // server-info 리소스 등록 - 가짜 서버 정보 반환
    server.registerResource(
        'server-info',
        'server://info',
        {
            title: 'Server Information',
            description: '현재 서버의 상태 및 정보를 반환합니다',
            mimeType: 'application/json'
        },
        async (uri) => {
            const serverInfo = {
                name: 'My MCP Server',
                version: '1.0.0',
                status: 'running',
                uptime: '72 hours 35 minutes',
                cpu_usage: '23.5%',
                memory_usage: '1.2GB / 8GB',
                disk_usage: '45.2GB / 256GB',
                active_connections: 142,
                requests_per_minute: 1250,
                environment: 'production',
                region: 'ap-northeast-2',
                last_restart: '2025-11-24T10:30:00Z',
                health_check: 'healthy'
            }
            
            return {
                contents: [{
                    uri: uri.href,
                    mimeType: 'application/json',
                    text: JSON.stringify(serverInfo, null, 2)
                }]
            }
        }
    )

    // ==================== Tools ====================

    // current-time 도구 등록
    server.registerTool(
        'current-time',
        {
            title: 'Current Time Tool',
            description: '타임존을 입력받아 해당 지역의 현재 시간을 반환합니다',
            inputSchema: {
                timezone: z.string().describe('타임존 (예: Asia/Seoul, America/New_York, Europe/London, Asia/Tokyo, UTC)')
            },
            outputSchema: {
                timezone: z.string(),
                datetime: z.string(),
                date: z.string(),
                time: z.string()
            }
        },
        async ({ timezone }) => {
            try {
                const now = new Date()
                
                const dateTimeFormatter = new Intl.DateTimeFormat('ko-KR', {
                    timeZone: timezone,
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: false
                })
                
                const dateFormatter = new Intl.DateTimeFormat('ko-KR', {
                    timeZone: timezone,
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit'
                })
                
                const timeFormatter = new Intl.DateTimeFormat('ko-KR', {
                    timeZone: timezone,
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: false
                })

                const datetime = dateTimeFormatter.format(now)
                const date = dateFormatter.format(now)
                const time = timeFormatter.format(now)

                const message = `🕐 ${timezone} 현재 시간: ${datetime}`
                const output = { timezone, datetime, date, time }

                return {
                    content: [{ type: 'text', text: message }],
                    structuredContent: output
                }
            } catch (error) {
                return {
                    content: [{ type: 'text', text: `오류: 유효하지 않은 타임존입니다 - ${timezone}` }],
                    isError: true
                }
            }
        }
    )

    // generate-image 도구 등록
    server.registerTool(
        'generate-image',
        {
            title: 'Image Generation Tool',
            description: '텍스트 프롬프트를 입력받아 AI 이미지를 생성합니다 (FLUX.1-schnell 모델 사용)',
            inputSchema: {
                prompt: z.string().describe('생성할 이미지에 대한 설명 (영어 권장)')
            }
        },
        async ({ prompt }) => {
            try {
                // Hugging Face API를 통해 이미지 생성
                const image = await hfClient.textToImage({
                    provider: 'auto',
                    model: 'black-forest-labs/FLUX.1-schnell',
                    inputs: prompt,
                    parameters: { num_inference_steps: 5 }
                })

                // Blob을 ArrayBuffer로 변환 후 Base64 인코딩
                const blob = image as unknown as Blob
                const arrayBuffer = await blob.arrayBuffer()
                const base64Data = Buffer.from(arrayBuffer).toString('base64')

                return {
                    content: [
                        {
                            type: 'image',
                            data: base64Data,
                            mimeType: 'image/png',
                            annotations: {
                                audience: ['user'],
                                priority: 0.9
                            }
                        }
                    ]
                }
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류'
                return {
                    content: [{ type: 'text', text: `이미지 생성 오류: ${errorMessage}` }],
                    isError: true
                }
            }
        }
    )

    // Smithery 요구사항: MCP server 객체 반환
    return server.server
}
