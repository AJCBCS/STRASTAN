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
var assembleAndDecryptOrgUnit = (item) => {
  if (!item) {
    return null;
  }
  const orgUnit = {
    unitId: item.unitId,
    departmentId: item.departmentId,
    unitName: item.unitName ? decrypt(item.unitName) : "",
    description: item.description ? decrypt(item.description) : "",
    effectiveDate: item.effectiveDate || "",
    costCenterInfo: item.costCenterInfo || "",
    createdBy: item.createdBy || "",
    createdAt: item.createdAt || ""
  };
  return orgUnit;
};
exports.handler = async (event) => {
  const { unitId } = event.pathParameters;
  console.log(`Received request to get org unit ID: ${unitId}`);
  if (!unitId) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: "Organizational Unit ID is required." })
    };
  }
  const pk = `ORG#ORG_UNIT#${unitId}`;
  const sk = "METADATA";
  const getParams = {
    TableName: tableName,
    Key: {
      PK: { S: pk },
      SK: { S: sk }
    }
  };
  try {
    console.log(`Querying DynamoDB for PK: ${pk}`);
    const { Item } = await dbClient.send(new GetItemCommand(getParams));
    if (!Item) {
      console.warn(`No org unit found for ID: ${unitId}`);
      return {
        statusCode: 404,
        body: JSON.stringify({ message: "Organizational Unit not found." })
      };
    }
    const unmarshalledItem = unmarshall(Item);
    const orgUnit = assembleAndDecryptOrgUnit(unmarshalledItem);
    console.log(`Successfully retrieved org unit: ${unitId}`);
    return {
      statusCode: 200,
      body: JSON.stringify({ orgUnit })
    };
  } catch (error) {
    console.error("Error fetching org unit:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: "Internal Server Error. Failed to retrieve org unit.",
        error: error.message
      })
    };
  }
};
