const fs = require("fs");
const s = fs.readFileSync("node_modules/prisma/dist/prisma.js", "utf8");
const kws = ["ormConfig", "orm:", '"orm"', "contract:", "db:", "connection", "loadPrismaConfig", "readConfig", "parseConfig", "envelope", "prisma.config.ts"];
for (const kw of kws) {
  let i = s.indexOf(kw);
  let n = 0;
  while (i >= 0 && n < 2) {
    console.log("=== " + kw + " @" + i);
    console.log(s.slice(Math.max(0, i - 200), i + 250).replace(/\n/g, " "));
    i = s.indexOf(kw, i + 1);
    n++;
  }
}
