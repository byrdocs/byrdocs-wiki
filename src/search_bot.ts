const keyword = [
	"googlebot",
	"applebot",
	"baiduspider",
	"bingbot",
]


export async function is_search_bot(user_agent?: string, ip?: string) {
	try {
		if (!ip || !user_agent) return false
		const ua = user_agent.toLowerCase()
		if (keyword.every(k => !ua.includes(k))) return false
		const res = await fetch("https://is-search-bot.youxam.workers.dev/?" + new URLSearchParams({ ip }).toString())
		const data: any = await res.json()
		return data?.success && data?.isBot
	} catch (e) {
		console.error("is_search_bot Error:", e)
		return false
	}
}
