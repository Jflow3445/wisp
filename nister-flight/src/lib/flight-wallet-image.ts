import sharp from "sharp";
import jsQR from "jsqr";
import { tronAddressHex } from "./flight-tron-address";

export async function validateWalletImage(data: string, address: string) {
  if (!/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(data) || data.length > 550000) throw new Error("Choose a PNG, JPEG or WebP QR image smaller than 400 KB.");
  try {
    const input = Buffer.from(data.slice(data.indexOf(",") + 1), "base64");
    const image = sharp(input, { limitInputPixels: 4000000 }).rotate().resize({ width: 640, height: 640, fit: "inside", withoutEnlargement: true }).flatten({ background: "white" }).ensureAlpha();
    const { data: pixels, info } = await image.clone().raw().toBuffer({ resolveWithObject: true });
    const qr = jsQR(new Uint8ClampedArray(pixels), info.width, info.height), decoded = qr?.data.trim();
    if (!decoded) throw new Error();
    let destination = decoded;
    if (/^tron:/i.test(decoded)) {
      const uri = new URL(decoded);
      if ([...uri.searchParams.keys()].some(key => key !== "token") || uri.searchParams.getAll("token").length > 1 || (uri.searchParams.has("token") && uri.searchParams.get("token")?.toUpperCase() !== "USDT")) throw new Error();
      destination = uri.pathname.replace(/^\/\//, "");
    }
    if (!tronAddressHex(address) || tronAddressHex(destination) !== tronAddressHex(address)) throw new Error();
    const corners = [qr!.location.topLeftCorner, qr!.location.topRightCorner, qr!.location.bottomLeftCorner, qr!.location.bottomRightCorner];
    const masked = new Uint8ClampedArray(pixels), left = Math.max(0, Math.floor(Math.min(...corners.map(p => p.x))) - 6), right = Math.min(info.width, Math.ceil(Math.max(...corners.map(p => p.x))) + 6), top = Math.max(0, Math.floor(Math.min(...corners.map(p => p.y))) - 6), bottom = Math.min(info.height, Math.ceil(Math.max(...corners.map(p => p.y))) + 6);
    for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) masked.fill(255, (y * info.width + x) * 4, (y * info.width + x) * 4 + 4);
    if (jsQR(masked, info.width, info.height)) throw new Error();
    const png = await image.png().toBuffer();
    if (png.length > 400000) throw new Error();
    return `data:image/png;base64,${png.toString("base64")}`;
  } catch { throw new Error("The image must contain a readable QR code for this exact TRON address, without a fixed payment amount."); }
}
