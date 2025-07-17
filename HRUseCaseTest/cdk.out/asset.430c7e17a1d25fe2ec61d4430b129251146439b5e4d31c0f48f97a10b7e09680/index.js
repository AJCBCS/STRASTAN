var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};

// lambda/utils/cryptoUtil.js
var require_cryptoUtil = __commonJS({
  "lambda/utils/cryptoUtil.js"(exports2, module2) {
    var crypto = require("crypto");
    var ALGORITHM = "aes-256-cbc";
    var SECRET_KEY = process.env.AES_SECRET_KEY;
    var IV_LENGTH = 16;
    if (!SECRET_KEY || SECRET_KEY.length !== 32) {
      throw new Error("A 32-byte AES_SECRET_KEY must be provided via environment variables.");
    }
    var keyBuffer = Buffer.from(SECRET_KEY, "utf8");
    var encrypt = (text) => {
      const iv = crypto.randomBytes(IV_LENGTH);
      const cipher = crypto.createCipheriv(ALGORITHM, keyBuffer, iv);
      let encrypted = cipher.update(text, "utf8", "hex");
      encrypted += cipher.final("hex");
      return `${iv.toString("hex")}:${encrypted}`;
    };
    var decrypt2 = (text) => {
      try {
        const textParts = text.split(":");
        const iv = Buffer.from(textParts.shift(), "hex");
        const encryptedText = textParts.join(":");
        const decipher = crypto.createDecipheriv(ALGORITHM, keyBuffer, iv);
        let decrypted = decipher.update(encryptedText, "hex", "utf8");
        decrypted += decipher.final("utf8");
        return decrypted;
      } catch (error) {
        console.error("Decryption failed:", error);
        return null;
      }
    };
    module2.exports = {
      encrypt,
      decrypt: decrypt2
    };
  }
});

// lambda/organization/dev-orgUnit/listOrgUnit.js
var { DynamoDBClient, ScanCommand } = require("@aws-sdk/client-dynamodb");
var { unmarshall } = require("@aws-sdk/util-dynamodb");
var { decrypt } = require_cryptoUtil();
var dbClient = new DynamoDBClient({ region: process.env.AWS_REGION });
var orgTable = process.env.ORGANIZATIONAL_TABLE_NAME;
var filterableFields = ["costCenterInfo", "createdBy", "effectiveDate"];
exports.handler = async (event) => {
  console.log("Received request to list org units with filters:", event.queryStringParameters);
  try {
    const query = event.queryStringParameters || {};
    const scanCommand = new ScanCommand({ TableName: orgTable });
    const result = await dbClient.send(scanCommand);
    const allItems = result.Items ? result.Items.map(unmarshall) : [];
    const orgUnits = allItems.filter((item) => item.PK?.startsWith("ORG#ORGUNIT#") && item.SK === "METADATA").filter((item) => {
      return Object.entries(query).every(([key, value]) => {
        if (!filterableFields.includes(key)) return true;
        if (item[key] === void 0 || item[key] === null) return false;
        return item[key].toString().toLowerCase() === value.toString().toLowerCase();
      });
    }).map((item) => ({
      unitId: item.unitId,
      unitName: item.unitName ? decrypt(item.unitName) : "",
      description: item.description ? decrypt(item.description) : "",
      effectiveDate: item.effectiveDate,
      costCenterInfo: item.costCenterInfo,
      createdBy: item.createdBy,
      createdAt: item.createdAt
    }));
    return {
      statusCode: 200,
      body: JSON.stringify({ count: orgUnits.length, orgUnits })
    };
  } catch (err) {
    console.error("ListOrgUnit Error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: "Failed to list organizational units", error: err.message })
    };
  }
};
