## generate H5 single page game by AI 
This file is shared intruction context for LLM coding agents. 

### General Code Gen Rules:
1. always use following cdn url for tailwind css 
<script src="https://cdn.keepwork.com/keepwork/cdn/tailwindcss@3.4.16.js"></script>
2. do NOT use other css or font files. 
3. generate UI layout that works on landscape mode by default without the need to scroll. 
4. do NOT use DOMContentLoaded event, just start the game at the end of the script tag. 

### KeepworkSDK Usage:
if the page needs to store data on server side or use services like text to speech, LLM chatting, etc. include following:
<script src="https://cdn.keepwork.com/sdk/keepworkSDK.iife.js"></script>

```javascript
// Initialize SDK
const sdk = new KeepworkSDK({
    timeout: 30000
});
console.log(`Keepwork SDK initialized token: ${sdk.token}`);
```

### User instructions
