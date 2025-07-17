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
var {
  DynamoDBClient,
  QueryCommand,
  GetItemCommand,
  PutItemCommand,
  ScanCommand
} = require("@aws-sdk/client-dynamodb");
var { unmarshall } = require("@aws-sdk/util-dynamodb");
var { decrypt } = require_cryptoUtil();
var dbClient = new DynamoDBClient({ region: process.env.AWS_REGION });
var PERSONNEL_TABLE = process.env.PERSONNEL_TABLE_NAME;
var ORGANIZATIONAL_TABLE = process.env.ORGANIZATIONAL_TABLE_NAME;
exports.handler = async (event) => {
  for (const record of event.Records) {
    const snsMessage = JSON.parse(record.body);
    const body = JSON.parse(snsMessage.Message);
    const { departmentId, action } = body;
    if (action === "GET_ALL_DEPARTMENTS") {
      console.log("\u{1F4E6} Performing BULK department aggregation");
      const scanRes = await dbClient.send(new ScanCommand({
        TableName: ORGANIZATIONAL_TABLE,
        FilterExpression: "begins_with(PK, :prefix) AND SK = :meta",
        ExpressionAttributeValues: {
          ":prefix": { S: "ORG#DEPARTMENT#" },
          ":meta": { S: "METADATA" }
        }
      }));
      const departments = scanRes.Items.map((item) => unmarshall(item));
      for (const dept of departments) {
        await processDepartment(dept.departmentId);
      }
      console.log(`\u2705 Bulk aggregation complete for ${departments.length} departments`);
      continue;
    }
    if (departmentId) {
      console.log(`\u{1F4E6} Aggregating data for department ID: ${departmentId}`);
      await processDepartment(departmentId);
    }
  }
};
async function processDepartment(departmentId) {
  try {
    const deptResult = await dbClient.send(new GetItemCommand({
      TableName: ORGANIZATIONAL_TABLE,
      Key: {
        PK: { S: `ORG#DEPARTMENT#${departmentId}` },
        SK: { S: "METADATA" }
      }
    }));
    if (!deptResult.Item) {
      console.warn(`\u274C Department not found: ${departmentId}`);
      return;
    }
    const department = unmarshall(deptResult.Item);
    const decryptedDeptName = decrypt(department.departmentName);
    let managerInfo = {
      employeeId: department.departmentManager,
      fullName: "Unknown",
      status: "Unknown"
    };
    try {
      const managerPersonalRes = await dbClient.send(new GetItemCommand({
        TableName: PERSONNEL_TABLE,
        Key: {
          PK: { S: `EMPLOYEE#${department.departmentManager}` },
          SK: { S: "SECTION#PERSONAL_DATA" }
        }
      }));
      if (managerPersonalRes.Item) {
        const personal = unmarshall(managerPersonalRes.Item);
        const firstName = personal.firstName ? decrypt(personal.firstName) : "";
        const lastName = personal.lastName ? decrypt(personal.lastName) : "";
        managerInfo.fullName = `${firstName} ${lastName}`.trim();
        managerInfo.status = personal.status || "Unknown";
      }
    } catch (err) {
      console.error(`\u26A0\uFE0F Failed to fetch manager data for ${department.departmentManager}`, err);
    }
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
        const employeeId = base.employeeId || base.PK?.split("#")[1];
        let fullName = "Unknown";
        let positionName = "Unknown";
        try {
          const personalRes = await dbClient.send(new GetItemCommand({
            TableName: PERSONNEL_TABLE,
            Key: {
              PK: { S: `EMPLOYEE#${employeeId}` },
              SK: { S: "SECTION#PERSONAL_DATA" }
            }
          }));
          if (personalRes.Item) {
            const personal = unmarshall(personalRes.Item);
            const firstName = personal.firstName ? decrypt(personal.firstName) : "";
            const lastName = personal.lastName ? decrypt(personal.lastName) : "";
            fullName = `${firstName} ${lastName}`.trim();
          }
        } catch (err) {
          console.error(`\u26A0\uFE0F Failed to fetch personal data for ${employeeId}`, err);
        }
        try {
          const contractRes = await dbClient.send(new GetItemCommand({
            TableName: PERSONNEL_TABLE,
            Key: {
              PK: { S: `EMPLOYEE#${employeeId}` },
              SK: { S: "SECTION#CONTRACT_DETAILS" }
            }
          }));
          if (contractRes.Item) {
            const contract = unmarshall(contractRes.Item);
            positionName = contract.role || "Unknown";
          }
        } catch (err) {
          console.error(`\u26A0\uFE0F Failed to fetch contract for ${employeeId}`, err);
        }
        return {
          employeeId,
          fullName,
          positionName
        };
      })
    );
    const positionScanRes = await dbClient.send(new ScanCommand({
      TableName: ORGANIZATIONAL_TABLE,
      FilterExpression: "begins_with(PK, :posPrefix) AND SK = :meta AND reportsTo = :mgrId",
      ExpressionAttributeValues: {
        ":posPrefix": { S: "ORG#POSITION#" },
        ":meta": { S: "METADATA" },
        ":mgrId": { S: department.departmentManager }
      }
    }));
    const reportingPositions = (positionScanRes.Items || []).map((item) => {
      const pos = unmarshall(item);
      return {
        positionId: pos.positionId,
        title: pos.positionTitle,
        reportsTo: pos.reportsTo
      };
    });
    const enrichedView = {
      departmentId,
      departmentName: decryptedDeptName,
      manager: managerInfo,
      reportingPositions,
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
    console.log(`\u2705 Stored enriched view for department ${departmentId}`);
  } catch (err) {
    console.error(`\u274C Error processing department ${departmentId}`, err);
  }
}
