const fs = require('fs');
const path = require('path');
const { setGlobal } = require('./db');

const BASE_DIR = '/home/ubuntu/test/commands/builds/builds_data';
const HUNTERS_DIR = path.join(BASE_DIR, 'Hunters');
const GEMS_FILE = path.join(BASE_DIR, 'Gems', 'gems.json');

function saveBuildFile(filename, content) {
  setGlobal(`buildFile:${filename}`, content ?? {});
  console.log(`Imported: ${filename}`);
}

function importOne(diskPath, dbFilename) {
  const raw = fs.readFileSync(diskPath, 'utf8');
  const json = JSON.parse(raw);
  saveBuildFile(dbFilename, json);
}

function main() {
  if (fs.existsSync(GEMS_FILE)) {
    importOne(GEMS_FILE, 'Gems/gems.json');
  }

  if (fs.existsSync(HUNTERS_DIR)) {
    const files = fs.readdirSync(HUNTERS_DIR)
      .filter(name => name.toLowerCase().endsWith('.json'));

    for (const file of files) {
      importOne(path.join(HUNTERS_DIR, file), `Hunters/${file}`);
    }

    console.log(`Done. Imported hunter files: ${files.length}`);
  }
}

main();