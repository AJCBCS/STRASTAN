// lambda/organization/dev-department/listDepartment.js
exports.handler = async (event) => {
  console.log("listDepartment Lambda Invoked:", event);
  return {
    statusCode: 200,
    body: JSON.stringify({ message: "Lists all department details" })
  };
};
