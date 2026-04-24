// Este código roda no DENTRO do ambiente da página do WhatsApp
console.log("🔥 Compraki WA-JS Injetado no Escopo MAIN!");

let wppInitAttempts = 0;
const wppInterval = setInterval(() => {
    if (typeof WPP !== 'undefined') {
        clearInterval(wppInterval);
        WPP.webpack.injectLoader();
        console.log("✅ WPP Webpack Loader Injetado.");
    } else {
        wppInitAttempts++;
        if(wppInitAttempts > 20) {
            clearInterval(wppInterval);
            console.error("ERRO COMPRAKI: WPP Object não carregou na página.");
        }
    }
}, 500);

// Escuta comandos vindos do Content Script isolado
window.addEventListener("message", async (event) => {
    // Apenas confia em nossa extensão
    if (event.data && event.data.type === "COMPRAKI_TO_PAGE") {
        const payload = event.data.payload;
        
        if (payload.action === 'GET_GROUPS') {
            try {
                if(!WPP.isReady) throw new Error("Aguarde, WhatsApp ainda está carregando nas engrenagens.");
                const chats = await WPP.chat.list();
                const groups = chats.filter(c => c.isGroup).map(g => ({
                    id: g.id._serialized,
                    name: g.name
                }));
                window.postMessage({ type: "COMPRAKI_TO_CONTENT", id: payload.id, response: { groups } }, "*");
            } catch(e) {
                window.postMessage({ type: "COMPRAKI_TO_CONTENT", id: payload.id, response: { error: e.message } }, "*");
            }
        }
        
        else if (payload.action === 'SEND_MESSAGE') {
            try {
                if(!WPP.isReady) throw new Error("Aguarde, WhatsApp ainda está carregando.");
                const { groupId, text, imageUrl } = payload.data;
                
                if (imageUrl) {
                    await WPP.chat.sendFileMessage(groupId, imageUrl, {
                        type: 'image',
                        caption: text
                    });
                } else {
                    await WPP.chat.sendTextMessage(groupId, text);
                }
                
                window.postMessage({ type: "COMPRAKI_TO_CONTENT", id: payload.id, response: { success: true } }, "*");
            } catch(e) {
                window.postMessage({ type: "COMPRAKI_TO_CONTENT", id: payload.id, response: { error: e.message } }, "*");
            }
        }
    }
}, false);
