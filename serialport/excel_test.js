var ejsExcel = require("ejsexcel");
var fs = require("fs");
//获得Excel模板的buffer对象
var exlBuf = fs.readFileSync("./fail_record.xlsx");

//数据源
var data = [[],[{"meterid":"pt1","meterpr":"des1","date":new Date().toLocaleString()},{"meterid":"pt1","meterpr":"des1","date":new Date().toLocaleString()}]];

//用数据源(对象)data渲染Excel模板
ejsExcel.renderExcelCb(exlBuf, data, function(exlBuf2){
  fs.writeFileSync("./test2.xlsx", exlBuf2);
  console.log("生成test2.xlsx");
});

