# Unidades

Sistema de registros de documentos separado por unidade, com banco em Google Sheets via Google Apps Script.

## Links

- App publicado: https://script.google.com/macros/s/AKfycbzUm3AJP-pwbgccFFGsn6YorUTM0ic4jEJdq_M_9haQwEp4VZKr7o0ZY4eaGz0prKXU/exec
- Planilha banco de dados: https://drive.google.com/open?id=1xFwY5UEs0nkUvz7we3WFlrRjfoEQsIHezZlP2k7rHeM
- Projeto Apps Script: https://script.google.com/d/10TCgouVk5KqrtKv7QjgVbTt1ZM0XHoyv1-Y_2sky6jcYDTfjTwRV25gx/edit

## Acessos

- Jaguapitã: `jaguapita`
- Palmeiras: `palmeiras`
- Ipuaçu: `ipuacu`
- Arapongas: `arapongas`
- Rondon: `rondon`
- Painel da Rosa: login `rosa`, senha inicial `gass`

## Desenvolvimento

```bash
npm install
npm run dev
npm run lint
npm run build
npm run build:apps-script
```

Para publicar o Apps Script:

```bash
cd apps-script
npx @google/clasp push --force
npx @google/clasp deploy --description "Unidades web app"
```
