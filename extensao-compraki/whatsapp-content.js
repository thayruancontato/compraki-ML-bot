// Roda no DOM Isolado do Whatsapp, serve de ponte entre o Background da Extensão e a Injeção MAIN

console.log("🔧 Ponte Isolada Iniciada...");

const pendingPromises = {};

window.addEventListener("message", (event) => {
    if (event.data && event.data.type === "COMPRAKI_TO_CONTENT") {
        if(pendingPromises[event.data.id]){
            pendingPromises[event.data.id](event.data.response);
            delete pendingPromises[event.data.id];
        }
    }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    const id = Date.now() + Math.random();
    pendingPromises[id] = sendResponse;
    // Dispara a mensagem via DOM para o script MAIN que está rodando o WAJS
    window.postMessage({ type: 'COMPRAKI_TO_PAGE', payload: { action: request.action, data: request.data, id } }, '*');
    return true; // Keep message channel open para envio assíncrono
});
