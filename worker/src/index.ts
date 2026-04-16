export interface Env {
	ML_APP_ID: string;
	ML_SECRET_KEY: string;
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);
		
		const commonHeaders = {
			'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
			'Accept': 'application/json'
		};

		if (url.pathname === '/search') {
			const query = url.searchParams.get('q');
			const limit = url.searchParams.get('limit') || '10';
			if (!query) return new Response('Missing q', { status: 400 });

			try {
				// BUSCA AUTENTICADA (MAIS ESTÁVEL)
				const token = await getMLToken(env);
				const resp = await fetch(`https://api.mercadolibre.com/sites/MLB/search?q=${encodeURIComponent(query)}&limit=${limit}`, {
					headers: { 
						...commonHeaders,
						'Authorization': `Bearer ${token}`
					}
				});
				
				const status = resp.status;
				const data = await resp.json();
				
				return new Response(JSON.stringify({
					worker_status: status,
					ml_response: data
				}), {
					headers: { 
						'Content-Type': 'application/json',
						'Access-Control-Allow-Origin': '*' 
					}
				});
			} catch (err: any) {
				return new Response(JSON.stringify({ error: err.message }), { 
					status: 500,
					headers: { 'Access-Control-Allow-Origin': '*' }
				});
			}
		}

		if (url.pathname === '/items') {
			const itemId = url.searchParams.get('id');
			if (!itemId) return new Response('Missing id', { status: 400 });

			try {
				const token = await getMLToken(env);
				const resp = await fetch(`https://api.mercadolibre.com/items/${itemId}`, {
					headers: { 
						...commonHeaders,
						'Authorization': `Bearer ${token}` 
					}
				});
				return new Response(await resp.text(), {
					headers: { 'Content-Type': 'application/json' }
				});
			} catch (err: any) {
				return new Response(JSON.stringify({ error: err.message }), { status: 500 });
			}
		}

		if (url.pathname === '/scrape') {
			const query = url.searchParams.get('q');
			if (!query) return new Response('Missing q', { status: 400 });

			try {
				const publicUrl = `https://lista.mercadolivre.com.br/${encodeURIComponent(query)}`;
				const rs = await fetch(publicUrl, {
					headers: {
						'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36',
						'Accept-Language': 'pt-BR,pt;q=0.9',
						'Accept': 'text/html'
					}
				});
				const html = await rs.text();
				return new Response(html, {
					headers: { 
						'Content-Type': 'text/html',
						'Access-Control-Allow-Origin': '*'
					}
				});
			} catch (err: any) {
				return new Response(JSON.stringify({ error: err.message }), { status: 500 });
			}
		}

		return new Response('Compraki Bridge Active v3', { status: 200 });
	},
};

async function getMLToken(env: Env) {
	const resp = await fetch('https://api.mercadolibre.com/oauth/token', {
		method: 'POST',
		headers: { 
			'Content-Type': 'application/x-www-form-urlencoded',
			'User-Agent': 'ComprakiBot/1.0'
		},
		body: `grant_type=client_credentials&client_id=${env.ML_APP_ID}&client_secret=${env.ML_SECRET_KEY}`
	});
	const data: any = await resp.json();
	if (data.access_token) return data.access_token;
	throw new Error('Token error: ' + (data.message || data.error));
}
