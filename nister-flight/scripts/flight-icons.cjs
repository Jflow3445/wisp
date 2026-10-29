const sharp = require("sharp");
const fs = require("node:fs/promises");
async function main() {
  const source = await fs.readFile("public/flight-icon.svg");
  const sizes = [16, 32, 48];
  const images = await Promise.all(sizes.map(size => sharp(source).resize(size, size).png().toBuffer()));
  const header = Buffer.alloc(6 + sizes.length * 16);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(sizes.length, 4);
  let offset = header.length;
  sizes.forEach((size, i) => {
    const entry = 6 + i * 16;
    header[entry] = size; header[entry + 1] = size;
    header.writeUInt16LE(1, entry + 4); header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(images[i].length, entry + 8); header.writeUInt32LE(offset, entry + 12);
    offset += images[i].length;
  });
  await fs.writeFile("src/app/favicon.ico", Buffer.concat([header, ...images]));
  await fs.writeFile("public/flight-icon-32.png", images[1]);
  await sharp(source).resize(180, 180).png().toFile("public/flight-apple-icon.png");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
