import { v2 as cloudinary } from "cloudinary";
import { CONFIG } from "./flavour.js";  // yahi file se ENV values mil rahi hain

cloudinary.config({
  cloud_name: CONFIG.CLOUDINARY_CLOUD_NAME,
  api_key: CONFIG.CLOUDINARY_API_KEY,
  api_secret: CONFIG.CLOUDINARY_API_SECRET,
});

export { cloudinary };
