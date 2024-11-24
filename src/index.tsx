import { Hono, Context } from 'hono';
import { getSignedCookie, setSignedCookie } from 'hono/cookie';

import { createChecker } from 'is-in-subnet';
import { buptSubnets } from '../bupt';

import { Login } from './pages/login';
import { login } from './login';

const ipChecker = createChecker(buptSubnets);

export async function setCookie(c: Context) {
	await setSignedCookie(c, "login", Date.now().toString(), c.env.JWT_SECRET, {
		maxAge: 2592000,
		secure: true,
		sameSite: "None",
		path: "/"
	})
}

export default new Hono<{
	Bindings: {
		JWT_SECRET: string
		TOKEN: string
		HEADER: string
	}
}>()
	.get("/login", async c => {
		const ip = c.req.header("CF-Connecting-IP") || "未知"
		if (ip !== "未知" && ipChecker(ip)) return c.redirect(c.req.query("to") || "/")
		return c.render(<Login ip={ip} />)
	})
	.post("/login", async c => {
		const ip = c.req.header("CF-Connecting-IP") || "未知"
		if (ip !== "未知" && ipChecker(ip)) return c.redirect(c.req.query("to") || "/")
		const { studentId, password } = await c.req.parseBody()
		if (typeof studentId !== "string" || typeof password !== "string") {
			return c.render(<Login errorMsg="输入不合法" ip={ip} />)
		}
		try {
			if (await login(studentId, password)) {
				await setCookie(c)
				return c.redirect(c.req.query("to") || "/")
			}
			return c.render(<Login errorMsg="可能是用户名或密码错误" ip={ip} />)
		} catch (e) {
			return c.render(<Login errorMsg={(e as Error).message || e?.toString() || "未知错误"} ip={ip} />)
		}
	})
	.use(async (c, next) => {
		const token = c.req.header("X-Byrdocs-Token")
		const ip = c.req.header("CF-Connecting-IP")
		const cookie = await getSignedCookie(c, c.env.JWT_SECRET, "login")
		if (
			(!ip || !ipChecker(ip)) &&
			token !== c.env.TOKEN &&
			(!cookie || isNaN(parseInt(cookie)) || Date.now() - parseInt(cookie) > 2592000 * 1000)
		) {
			const toq = new URL(c.req.url).searchParams
			if ((c.req.path === "" || c.req.path === '/') && toq.size === 0) return c.redirect("/login")
			const to = c.req.path + (toq.size > 0 ? "?" + toq.toString() : "")
			return c.redirect("/login?" + new URLSearchParams({ to }).toString())
		}
		await next();
	})
	.all(async c => {
		const request = c.req.raw;
		const url = new URL(request.url)
		url.hostname = 'wiki-internal.byrdocs.org'
		url.port = '443';
		url.protocol = 'https';
		const reqHeaders = new Headers(request.headers)
		reqHeaders.set("X-Byrdocs-Header", c.env.HEADER)
		const res = await fetch(
			url.toString(),
			{
				...request,
				redirect: "manual",
				headers: reqHeaders,
				body: request.body,
				method: request.method
			}
		);
		const header = new Headers(res.headers)
		const location = header.get("location");
		if (location) {
			const newLocation = new URL(location);
			newLocation.hostname = 'wiki.byrdocs.org';
			newLocation.port = '443';
			newLocation.protocol = 'https';
			if (newLocation) {
				header.set("location", newLocation.toString());
			}
			console.log(header)
		}

		return new Response(res.body, {
			...res,
			headers: header,
			status: res.status
		})
	})
