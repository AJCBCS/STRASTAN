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

// lambda/organization/dev-department/departmentAggregator.js
var { DynamoDBClient, QueryCommand, GetItemCommand, PutItemCommand } = require("@aws-sdk/client-dynamodb");
var { unmarshall } = require("@aws-sdk/util-dynamodb");
var { decrypt } = require_cryptoUtil();
var dbClient = new DynamoDBClient({ region: process.env.AWS_REGION });
var PERSONNEL_TABLE = process.env.PERSONNEL_TABLE_NAME;
var ORGANIZATIONAL_TABLE = process.env.ORGANIZATIONAL_TABLE_NAME;
exports.handler = async (event) => {
  for (const record of event.Records) {
    const snsMessage = JSON.parse(record.body);
    const body = JSON.parse(snsMessage.Message);
    const { departmentId } = body;
    console.log(`\u{1F4E6} Aggregating data for department ID: ${departmentId}`);
    const deptResult = await dbClient.send(new GetItemCommand({
      TableName: ORGANIZATIONAL_TABLE,
      Key: {
        PK: { S: `ORG#DEPARTMENT#${departmentId}` },
        SK: { S: "METADATA" }
      }
    }));
    if (!deptResult.Item) {
      console.warn(`\u274C Department not found: ${departmentId}`);
      continue;
    }
    const department = unmarshall(deptResult.Item);
    const decryptedDeptName = decrypt(department.departmentName);
    const employeeQuery = await dbClient.send(new QueryCommand({
      TableName: PERSONNEL_TABLE,
      IndexName: "DepartmentIndex",
      KeyConditionExpression: "departmentId = :deptId",
      ExpressionAttributeValues: {
        ":deptId": { S: departmentId }
      }
    }));
    const employees = await Promise.all(
      employeeQuery.Items.map(async (emp) => {
        const base = unmarshall(emp);
        const employeeId = base.employeeId;
        let fullName = "Unknown";
        let positionName = "Unknown";
        try {
          const personalDataRes = await dbClient.send(new GetItemCommand({
            TableName: PERSONNEL_TABLE,
            Key: {
              PK: { S: `EMPLOYEE#${base.employeeId}` },
              SK: { S: "PERSONAL_DATA" }
            }
          }));
          if (personalDataRes.Item) {
            const personal = unmarshall(personalDataRes.Item);
            const firstName = personal.firstName ? decrypt(personal.firstName) : "";
            const lastName = personal.lastName ? decrypt(personal.lastName) : "";
            fullName = `${firstName} ${lastName}`.trim();
          }
        } catch (e) {
          console.error(`\u26A0\uFE0F Error fetching personal data for ${employeeId}:`, e);
        }
        try {
          const contractRes = await dbClient.send(new GetItemCommand({
            TableName: PERSONNEL_TABLE,
            Key: {
              PK: { S: `EMPLOYEE#${base.employeeId}` },
              SK: { S: "CONTRACT_DETAILS" }
            }
          }));
          if (contractRes.Item) {
            const contract = unmarshall(contractRes.Item);
            positionName = contract.role || "Unknown";
          }
        } catch (e) {
          console.error(`\u26A0\uFE0F Error fetching contract details for ${base.employeeId}:`, e);
        }
        return {
          employeeId,
          fullName,
          positionId: base.positionId,
          positionName
        };
      })
    );
    const enrichedView = {
      departmentId,
      departmentName: decryptedDeptName,
      employees
    };
    await dbClient.send(new PutItemCommand({
      TableName: ORGANIZATIONAL_TABLE,
      Item: {
        PK: { S: `ORG#DEPARTMENT#${departmentId}` },
        SK: { S: "ENRICHED_VIEW" },
        data: { S: JSON.stringify(enrichedView) },
        createdAt: { S: (/* @__PURE__ */ new Date()).toISOString() }
      }
    }));
    console.log("\u2705 Successfully stored enriched department view:", JSON.stringify(enrichedView, null, 2));
  }
};
