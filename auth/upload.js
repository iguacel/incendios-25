import Client from "ssh2-sftp-client";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from 'url';
dotenv.config();

const LOCAL_URL = "../data";
const SFTP_URL = "/infografias/data/trackers/actions/ds-template";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 22;

// SFTP CONFIG
const config = {
  host: process.env.SFTP_SERVER,
  port: PORT,
  username: process.env.SFTP_USER,
  privateKey: Buffer.from(process.env.SFTP_PRIVATEKEY, "base64"),
};

// Error Handling Function
function handleErrors(err) {
  console.log(`Error: ${err.message}`);
}

// UPLOAD DIRECTORY
async function uploadDirectory(src, dest) {
  const client = new Client("upload-directory");

  try {
    // Enable debug logging
    // client.debug = console.log;

    await client.connect(config);

    // Check if the folder exists
    const folderExists = await client.exists(dest);

    if (!folderExists) {
      console.log(`Creating ${dest} folder...`);
      await client.mkdir(dest, true);
    }

    let result = await client.uploadDir(src, dest);
    client.on("upload", (info) => {
      console.log(`Uploaded ${info.source}`);
    });

    return result;
  } catch (err) {
    handleErrors(err);
  } finally {
    client.end();
  }
}

// Call the function for both directories
uploadDirectory(path.join(__dirname, LOCAL_URL), SFTP_URL);