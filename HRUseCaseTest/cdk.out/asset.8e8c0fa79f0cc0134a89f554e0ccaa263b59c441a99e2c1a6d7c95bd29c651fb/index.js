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

// lambda/organization/dev-department/getDepartment.js
var { DynamoDBClient, GetItemCommand } = require("@aws-sdk/client-dynamodb");
var { unmarshall } = require("@aws-sdk/util-dynamodb");
var { decrypt } = require_cryptoUtil();
var { SNSClient, PublishCommand } = require("@aws-sdk/client-sns");
var dbClient = new DynamoDBClient({ region: process.env.AWS_REGION });
var snsClient = new SNSClient({ region: process.env.AWS_REGION });
var tableName = process.env.ORGANIZATIONAL_TABLE_NAME;
var topicArn = process.env.DEPARTMENT_TOPIC_ARN;
exports.handler = async (event) => {
  const { departmentId } = event.pathParameters;
  console.log(`\u{1F50D} Received request to get department ID: ${departmentId}`);
  if (!departmentId) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: "Department ID is required." })
    };
  }
  try {
    const enrichedRes = await dbClient.send(new GetItemCommand({
      TableName: tableName,
      Key: {
        PK: { S: `ORG#DEPARTMENT#${departmentId}` },
        SK: { S: "ENRICHED_VIEW" }
      }
    }));
    if (enrichedRes.Item) {
      const item = unmarshall(enrichedRes.Item);
      const parsed = JSON.parse(item.data);
      console.log(`\u2705 Returning cached enriched view for department ${departmentId}`);
      return {
        statusCode: 200,
        body: JSON.stringify({ department: parsed })
      };
    }
    console.warn(`\u26A0\uFE0F Enriched view not found for department ${departmentId}, using METADATA`);
    const rawRes = await dbClient.send(new GetItemCommand({
      TableName: tableName,
      Key: {
        PK: { S: `ORG#DEPARTMENT#${departmentId}` },
        SK: { S: "METADATA" }
      }
    }));
    if (!rawRes.Item) {
      console.warn(`\u274C Department not found: ${departmentId}`);
      return {
        statusCode: 404,
        body: JSON.stringify({ message: "Department not found." })
      };
    }
    const data = unmarshall(rawRes.Item);
    const departmentDetails = {
      departmentId: data.departmentId,
      departmentCode: data.departmentCode,
      departmentType: data.departmentType,
      departmentName: decrypt(data.departmentName),
      description: data.description ? decrypt(data.description) : "",
      comments: data.comments ? decrypt(data.comments) : "",
      costCenter: data.costCenter,
      organizationLevel: data.organizationLevel,
      allowSubDepartments: data.allowSubDepartments,
      maximumPositions: data.maximumPositions,
      reportingStructure: data.reportingStructure,
      budgetControl: data.budgetControl,
      departmentManager: data.departmentManager,
      parentDepartment: data.parentDepartment || null,
      createdBy: data.createdBy,
      createdAt: data.createdAt
    };
    try {
      const snsPayload = {
        departmentId: departmentDetails.departmentId,
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      };
      await snsClient.send(new PublishCommand({
        TopicArn: topicArn,
        Message: JSON.stringify(snsPayload)
      }));
      console.log(`\u{1F4E4} Published department ID ${departmentId} to SNS topic`);
    } catch (snsError) {
      console.error(`\u274C Failed to publish department ${departmentId} to SNS`, snsError);
    }
    return {
      statusCode: 200,
      body: JSON.stringify({ department: departmentDetails })
    };
  } catch (err) {
    console.error("\u274C Error retrieving department:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: "Internal Server Error. Failed to retrieve department details.",
        error: err.message
      })
    };
  }
};
