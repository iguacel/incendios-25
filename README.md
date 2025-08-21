# incendios-25

```
node scripts/01split-ccaa.js
```

## Descargar EFFIS, descomponer en múltiples archivos. Añadir CCAA

```
node scripts/02stats.js
```

## Genera estadisticas_2025

https://docs.google.com/spreadsheets/d/1g6ENTuCojFNqgNqpQz5JoJE6ZCdnyO8XlXcaVkla4NQ/edit?gid=188002887#gid=188002887

## Join monty (para evolución)

```
node scripts/05-join-monty.js
```

## Evol (sin uso)

```
node scripts/04-evol.js
```

## Join Monty

```
node scripts/05-join-monty.js
```

## Ourense

```
node scripts/07-ourense.js
```

- [Repo template](https://github.com/iguacel/ds-template)
- [Use this template](https://github.com/new?template_name=ds-template&template_owner=iguacel&name=your-new-repo-name)

## Test sheet

[Edit](https://docs.google.com/spreadsheets/d/1g6ENTuCojFNqgNqpQz5JoJE6ZCdnyO8XlXcaVkla4NQ/edit?gid=0#gid=0)

## Node scripts

- Cd project

```bash
  npm install && code .
```

- Put .env in place

```bash
cp /Users/jaalvarez/Documents/ENV/.env .
```

- Replace ds-template -> new repo name
- If not created with use this template, trash .git
- Execute copy-secrets.sh
- Create scripts
- Run

```bash
node scripts/01.js
```

- Add yaml in ./github/workflows

## Python scripts

```bash
source sose/bin/activate
```

Creating a requirements.txt
To create a requirements.txt file based on the currently installed packages in your environment:

```bash
pip freeze > requirements.txt
```

Installing New Packages and Updating requirements.txt
Install new packages using pip:

```bash
pip install package-name
```

Update requirements.txt to include the new packages:

```bash
pip freeze > requirements.txt
```

Deactivating the environment:

```bash
deactivate
```

Run or execute

```bash
python3 scripts/01py.py
```

- Add yaml in ./github/workflows

## Upload to FTP server

- Node script: auth/upload.js
- Make sure to replace ds-template -> new repo name

```bash
npm run upload
```
