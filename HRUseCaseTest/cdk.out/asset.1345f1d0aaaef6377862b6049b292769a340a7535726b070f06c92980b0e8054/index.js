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

// lambda/organization/dev-orgUnit/getOrgUnit.js
var { DynamoDBClient, GetItemCommand } = require("@aws-sdk/client-dynamodb");
var { unmarshall } = require("@aws-sdk/util-dynamodb");
var { decrypt } = require_cryptoUtil();
var dbClient = new DynamoDBClient({ region: process.env.AWS_REGION });
var tableName = process.env.ORGANIZATIONAL_TABLE_NAME;
exports.handler = async (event) => {
  const { unitId } = event.pathParameters;
  console.log(`Received request to get details for org unit ID: ${unitId}`);
  if (!unitId) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: "Unit ID is required." })
    };
  }
  const key = {
    PK: { S: `ORG#ORGUNIT#${unitId}` },
    SK: { S: "METADATA" }
  };
  try {
    console.log(`Querying DynamoDB for org unit with PK: ORG#ORGUNIT#${unitId}`);
    const { Item } = await dbClient.send(new GetItemCommand({ TableName: tableName, Key: key }));
    if (!Item) {
      console.warn(`No org unit found for ID: ${unitId}.`);
      return {
        statusCode: 404,
        body: JSON.stringify({ message: "Organizational Unit not found." })
      };
    }
    const data = unmarshall(Item);
    console.log(`Successfully retrieved org unit for ID: ${unitId}`);
    return {
      statusCode: 200,
      body: JSON.stringify({
        unitId: data.unitId,
        unitName: decrypt(data.unitName),
        description: data.description ? decrypt(data.description) : "",
        effectiveDate: data.effectiveDate,
        costCenterInfo: data.costCenterInfo,
        createdBy: data.createdBy,
        createdAt: data.createdAt
      })
    };
  } catch (error) {
    console.error("An error occurred while retrieving org unit details:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: "Internal Server Error. Failed to retrieve org unit details.",
        error: error.message
      })
    };
  }
};
