// Background Service Worker - Ponte entre aba do ML e API Local do App
const API_URL = "http://localhost:3333/api";

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // ============= Comandos vindos do Content Script do ML =============
    if (request.type === "COMPRAKI_WA_COMMAND") {
        
        if (request.action === "GET_GROUPS") {
            fetch(`${API_URL}/groups`)
                .then(res => res.json())
                .then(data => sendResponse(data))
                .catch(err => {
                    console.error("Erro GET_GROUPS:", err);
                    sendResponse({ error: "APP_LOCAL_NOT_FOUND" });
                });
            return true;
        }
        
        if (request.action === "SEND_MESSAGE") {
            fetch(`${API_URL}/send`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(request.data)
            })
                .then(res => res.json())
                .then(data => sendResponse(data))
                .catch(err => {
                    console.error("Erro SEND_MESSAGE:", err);
                    sendResponse({ error: "APP_LOCAL_NOT_FOUND" });
                });
            return true;
        }
    }

    // ============= Check se App Local está aberto e conectado =============
    if (request.type === "COMPRAKI_CHECK_WA") {
        fetch(`${API_URL}/status`)
            .then(res => res.json())
            .then(data => sendResponse({ connected: data.connected }))
            .catch(() => sendResponse({ connected: false }));
        return true;
    }
});
