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

// lambda/personnel/searchEmployees.js
var { DynamoDBClient, ScanCommand } = require("@aws-sdk/client-dynamodb");
var { unmarshall } = require("@aws-sdk/util-dynamodb");
var { decrypt } = require_cryptoUtil();
var dbClient = new DynamoDBClient({ region: process.env.AWS_REGION });
var tableName = process.env.PERSONNEL_TABLE_NAME;
var assembleEmployee = (items) => {
  const combinedData = items.reduce((acc, item) => ({ ...acc, ...item }), {});
  const personalData = {
    firstName: decrypt(combinedData.firstName),
    lastName: decrypt(combinedData.lastName),
    middleName: combinedData.middleName ? decrypt(combinedData.middleName) : "",
    preferredName: combinedData.preferredName || "",
    nationalId: decrypt(combinedData.nationalId),
    dateOfBirth: combinedData.dateOfBirth,
    age: combinedData.age,
    gender: combinedData.gender,
    nationality: combinedData.nationality,
    maritalStatus: combinedData.maritalStatus
  };
  const contactInfo = {
    email: decrypt(combinedData.email),
    phone: decrypt(combinedData.phone),
    altPhone: combinedData.altPhone ? decrypt(combinedData.altPhone) : "",
    address: decrypt(combinedData.address),
    city: decrypt(combinedData.city),
    state: decrypt(combinedData.state),
    postalCode: decrypt(combinedData.postalCode),
    country: decrypt(combinedData.country),
    // --- NESTING FIX: Emergency contact fields are flattened ---
    emergencyContactName: combinedData.emergencyContactName ? decrypt(combinedData.emergencyContactName) : "",
    emergencyContactPhone: combinedData.emergencyContactPhone ? decrypt(combinedData.emergencyContactPhone) : "",
    emergencyContactRelationship: combinedData.emergencyContactRelationship ? decrypt(combinedData.emergencyContactRelationship) : ""
  };
  const contractDetails = {
    role: combinedData.role,
    department: combinedData.department,
    jobLevel: combinedData.jobLevel,
    contractType: combinedData.contractType,
    salaryGrade: combinedData.salaryGrade,
    salaryPay: combinedData.salaryPay,
    allowance: combinedData.allowance !== void 0 ? combinedData.allowance : null
  };
  return {
    employeeId: combinedData.PK.split("#")[1],
    personalData,
    contactInfo,
    contractDetails
  };
};
exports.handler = async (event) => {
  const query = event.queryStringParameters || {};
  console.log("Search request received with criteria:", query);
  if (Object.keys(query).length === 0) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: "At least one search parameter is required." })
    };
  }
  try {
    const scanResult = await dbClient.send(new ScanCommand({ TableName: tableName }));
    const allItems = scanResult.Items ? scanResult.Items.map(unmarshall) : [];
    const employeesMap = /* @__PURE__ */ new Map();
    for (const item of allItems) {
      if (!item.PK) continue;
      const pk = item.PK;
      if (!employeesMap.has(pk)) {
        employeesMap.set(pk, []);
      }
      employeesMap.get(pk).push(item);
    }
    const matchedPks = [];
    for (const [pk, items] of employeesMap.entries()) {
      const combinedData = items.reduce((acc, item) => ({ ...acc, ...item }), {});
      if (combinedData.status !== "ACTIVE") {
        continue;
      }
      const isMatch = Object.entries(query).every(([key, value]) => {
        if (combinedData[key] === void 0 || combinedData[key] === null) {
          return false;
        }
        return combinedData[key].toString().toLowerCase().includes(value.toString().toLowerCase());
      });
      if (isMatch) {
        matchedPks.push(pk);
      }
    }
    if (matchedPks.length === 0) {
      return {
        statusCode: 404,
        body: JSON.stringify({ message: "No matching employees found." })
      };
    }
    const finalResults = matchedPks.map((pk) => {
      const employeeItems = employeesMap.get(pk);
      return assembleEmployee(employeeItems);
    });
    console.log(`In-memory filter found ${finalResults.length} employees.`);
    return {
      statusCode: 200,
      body: JSON.stringify({ employees: finalResults })
    };
  } catch (err) {
    console.error("searchEmployees error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: "Search failed", error: err.message })
    };
  }
};
