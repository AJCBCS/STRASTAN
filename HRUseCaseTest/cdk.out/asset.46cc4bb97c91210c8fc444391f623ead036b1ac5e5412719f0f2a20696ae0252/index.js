// lambda/organization/dev-department/getDepartment.js
exports.handler = async (event) => {
  console.log("getDepartment Lambda Invoked:", event);
  return {
    statusCode: 200,
    body: JSON.stringify({ message: "Gets department details" })
  };
};
