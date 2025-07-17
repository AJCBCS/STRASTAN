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
var snsClient = new SNSClient({ region: process.env.AWS_REGION });
var dbClient = new DynamoDBClient({ region: process.env.AWS_REGION });
var tableName = process.env.TEST_ORGANIZATIONAL_TABLE_NAME;
exports.handler = async (event) => {
  const { departmentId } = event.pathParameters;
  console.log(`Received request to get details for department ID: ${departmentId}`);
  if (!departmentId) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: "Department ID is required." })
    };
  }
  const getParams = {
    TableName: tableName,
    Key: {
      PK: { S: `ORG#DEPARTMENT#${departmentId}` },
      // Partition Key
      SK: { S: "METADATA" }
      // Sort Key
    }
  };
  try {
    console.log(`Querying DynamoDB for department with PK: ORG#DEPARTMENT#${departmentId}`);
    const { Item } = await dbClient.send(new GetItemCommand(getParams));
    if (!Item) {
      console.warn(`Department with ID ${departmentId} not found.`);
      return {
        statusCode: 404,
        body: JSON.stringify({ message: "Department not found." })
      };
    }
    const data = unmarshall(Item);
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
      const snsMessage = {
        departmentId: data.departmentId,
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      };
      await snsClient.send(new PublishCommand({
        TopicArn: process.env.DEPARTMENT_TOPIC_ARN,
        Message: JSON.stringify(snsMessage)
      }));
      console.log(`Successfully published department ${data.departmentId} to SNS`);
    } catch (snsError) {
      console.error("Failed to publish to SNS topic:", snsError);
    }
    console.log(`Successfully retrieved and decrypted department ID: ${departmentId}`);
    return {
      statusCode: 200,
      body: JSON.stringify({ department: departmentDetails })
    };
  } catch (error) {
    console.error("An error occurred while retrieving department:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: "Internal Server Error. Failed to retrieve department details.",
        error: error.message
      })
    };
  }
};
