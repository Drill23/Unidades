# Unidades - Google Apps Script

Este diretorio hospeda o app e transforma uma planilha Google no banco compartilhado do sistema.

## Links

- Web app: https://script.google.com/macros/s/AKfycbzUm3AJP-pwbgccFFGsn6YorUTM0ic4jEJdq_M_9haQwEp4VZKr7o0ZY4eaGz0prKXU/exec
- Planilha: https://drive.google.com/open?id=1xFwY5UEs0nkUvz7we3WFlrRjfoEQsIHezZlP2k7rHeM
- Apps Script: https://script.google.com/d/10TCgouVk5KqrtKv7QjgVbTt1ZM0XHoyv1-Y_2sky6jcYDTfjTwRV25gx/edit

## Publicacao

```bash
npm run build:apps-script
cd apps-script
npx @google/clasp push --force
npx @google/clasp deploy -d "Unidades"
```

O Web App deve executar como a pessoa que publicou e aceitar acesso por link.
