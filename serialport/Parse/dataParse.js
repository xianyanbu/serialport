var fs = require('fs');
var settings = require('../settings.js');
var jsonFile = require(settings.Parse.jsonFile_dataparse_path);  //加载瑞纳json文件（数据解析规约）
//var jsonFile = require('./huizhong_A188.json');  //加载汇中json文件（数据解析规约）
//var  jsonFile = require('./haiweici_A188.json');  //加载海威茨json文件（数据解析规约）
//var  jsonFile = require('./sanlong_A188.json');  //加载三龙json文件（数据解析规约）
meter_type = ["water meter", "heat meter", "gas meter", "other meters"];//定义仪表类型
//10H~19H :水表，20H~29H:热量表，30H~39H:燃气表，40H~49H:其他仪表
//Meter test data buffer
meter_data_str = 'FEFEFEFEFEFEFEFEFEFEFEFEFE682591092059001111812E1F901000000000050003000005' +
    '00000000170000000035270000002C6014007414004654005149092204102004006D16';    //瑞纳
//meter_data_str = 'FEFEFEFEFEFEFEFEFEFEFE6820FFFFF130156920812E1F900100' +
//  '00000005604005000500000000170000000035831900002C1419001519002800000315170503042000084D16';   //汇中
//meter_data_str = 'FEFEFEFEFE682012345678905555812E1F90120000000005604005000500000000170000000035831900002C1419001519002800000315170503042000088116';//海威茨
var ctl_info = jsonFile.ctl_info;    //获取ctl_info下的所有变量
var meter_general_info = ctl_info.meter_general_info; //获取表具信息
var meter_read_protocol = ctl_info.meter_read_protocol;  //获取数据解析规则

var data_structure = meter_read_protocol.data_structure; //获取数据解析规则的各个数据所占字节数
var data_precision = meter_read_protocol.data_precision; //获取数据解析规则的各个数据的处理方式，乘以1，乘以0.1还是乘以0.01
var data_status_bits = meter_read_protocol.data_status_bits; //获取数据解析规则的表具状态标志位
var unit_dict = meter_read_protocol.unit_dict;  //获取数据解析规则的单位,mW,kWh等

var reg;  //定义一个正则表达式
var reg_temp = meter_general_info.iden_str; //获取数据标志位，标志位共6位，但前四位固定不变，后两位是会发生变化的，所以必须要根据不变的数据标识位找出全部的数据标志位
reg = new RegExp(reg_temp + "(\\S{2})", "g");  //根据接收到的标志位构造一个正则表达式

var leading_str = meter_general_info.leading_str;  //数据解码起始位，前导符FE的字节数必须大于4
var meter_code_len = meter_general_info.meter_code_len; //获取表号长度
var meter_code_reverse = meter_general_info.meter_code_reverse; //获取表号是否翻转
var meter_code_order = meter_general_info.meter_code_order;   //获取表号的顺序是否正常（只对于不需要表号反转的表），不正常的话，表号之外的多余位在后面
//正常的话，表号之外的多余位在前面

//字符串翻转，两两（1个字节）逆序排列
//说明：这里的字符串翻转并不是逐个的逆序排列，是两两的逆序排列。
//      也就是说一个字节的数据是不允许发生变换的，否则就会改变它的真实数值。
//      所以，这里首先要给一个字节的数据进行翻转，然后逐个地逆序排列整个字符串，这样变换的结果才是我们想要的结果
function reverse(str) {
    var res = "";
    var temp_elem = "";
    var temp = "";
    for (var i = 0; i < str.length; i++) {
        if (i % 2 == 0) {
            temp_elem = str[i + 1] + str[i];  //因为是字符串形式所以直接进行拼接
            temp += temp_elem;
        }
    }
    for (var j = 0; j < str.length; j++) {
        res += temp[str.length - 1 - j];    //翻转整个字符串
    }
    return res;
}
//提取json文件中的数据名称信息和，用于后面数据的乘法（数值转换）操作
function get_data_str() {
    var res = [];
    var result = [];
    for (var i = 0; i < data_structure.length; i++) {
        for (key in data_structure[i])  //这里的变量key可以任意命名
        {
            res[i] = key;                         //获取data_structure的key
            result[i] = data_structure[i][key] * 2; //获取对应的数据字节数*2.
            // 说明：1个字节是8位，但在取数组长度的时候，一个字节就被看成是两个长度，所以这里获取到的字节数要乘以2
        }
    }
    data_struct = res;   //定义两个全局变量，接收data_structure里的key和value
    data_len = result;
}
get_data_str();


//给对象赋值操作
//function add_object_info(object,val,unit)
//{
//    if(val == 0)
//    {
//        object.unit = unit ;
//    }
//    else if(unit == 0)
//    {
//        object.val = val;
//    }
//    else
//    {
//        object.val = val;
//        object.unit = unit ;
//    }
//}
//var hello = {val :  8,unit : 9};
//add_object_info(hello,1,0);
//console.log(hello);

/**********************************************start--状态位判断子模块--start***********************************************************************************/
//设计思路：状态位信息由很多种情况，如果人为进行所有可能性的组合，这是一个相当麻烦，而且容易出错的事情。
//          通过我的这种方法可以轻松的由计算机对状态位进行分析而进行有针对性的组合。

            /*******************************************************************/
            //  D7 ||   D6   ||  D5  || D4 || D3 ||    D2   ||    D1   || D0   ||
            /*******************************************************************/
            //无水 || 逆流  ||       ||    ||    ||回水故障 || 进水故障||      ||
            /*******************************************************************/
//这样我们只需要在json文件的状态信息里面写入4种可能性：“128”：“无水”，“64”：“逆流”，“4”：“回水故障”，“2”：“进水故障”
//举个例子：状态信息为C6-->>1100 0110,按位去找对应的10进制数值为：128 64 4 2；然后寻找对应的状态位信息得到结果为：无水，逆流，回水故障，进水故障。

// 获取每一位的数据信息，返回值为一个数组，记录着那一位的数据为1，比如返回值为[8]，则意味着字符串的倒数第四位为1，字符串为1000
function get_bit_value(str)
{
    var res = [];
    var res_val_count = 0;
    for(var i = 0;i<str.length;i++)
    {
        var count = str.length - 1 - i; //从后到前按位取
        if(str[count] == "1")    //状态位为1
        {
            res[res_val_count] = Math.pow(2,i);  //找出对应的10进制数值
            res_val_count ++;
        }
    }
    return res;

}

//状态位信息判断
function status_judge(str)
{
    //迈拓的状态位只有一位，即2个数据长度，所以要根据状态位的数据长度来进行不同的判断操作
    var res = "";
    var str_bit1 = str.slice(0, 2);
    var str_binary_bit1 = parseInt(str_bit1,16).toString(2); //转换成 2进制字符串，比如08转换成1000，它会丢掉前面为0的部分，所以取值的时候从后往前取
    var bit1_judge = get_bit_value(str_binary_bit1);
    if((str == "00") || (str == "0000") )
    {
        res = "状态正常";
    }
    else
    {
        for(var i = 0;i<bit1_judge.length;i++)
        {
            var temp_str1 = bit1_judge[i].toString();//数字转换成字符串
            if(res == "")
            {
                res += data_status_bits.byte1[temp_str1];  //在json文件里找对应的信息
            }
            else
            {
                res += "," + data_status_bits.byte1[temp_str1];
            }
        }
    }
    if(str.length == 4)
    {
        var str_bit2 = str.slice(2, 4);
        var str_binary_bit2 = parseInt(str_bit2,16).toString(2);
        var bit2_judge = get_bit_value(str_binary_bit2);
        for(var j = 0;j<bit2_judge.length;j++)
        {
            var temp_str2 = bit2_judge[j].toString();
            if(res == "")
            {
                res += data_status_bits.byte2[temp_str2];
            }
            else
            {
                res += "," + data_status_bits.byte2[temp_str2];
            }
        }
    }

    return res;
}
/**********************************************end--状态位判断子模块--end***********************************************************************************/
exports.dataParse = function dataParse(data_info) {
    meter_read_data = data_info.split(leading_str)[1];//以前导符分割接收到的数据，然后获取前导符后面的有效数据
    var iden_str = data_info.match(reg);     //采集数据分割点
    var decoded_str = {}; //接收解析后的数据
    var position = 0;     //标记字符串提取的起始位置
    var item_id = 0;     //一个中间变量
    for (index in data_len) //获取数组data_len里的所有元素数值
    {
        var temp_data = meter_read_data.slice(position, position + data_len[index]);
        if(meter_code_reverse == "false")
        {
            if ((iden_str == temp_data ) || (data_struct[item_id] == "status") || (data_struct[item_id] == "meter_code"))  //判断数据是否为数据标识位或状态码,对这2个数据不进行任何翻转操作
            {
                temp_data_str = temp_data;
            }
            else {
                //数据翻转
                temp_data_str = reverse(meter_read_data.slice(position, position + data_len[index]));
            }
        }
        else
        {
            if ((iden_str == temp_data ) || (data_struct[item_id] == "status"))  //判断数据是否为数据标识位或状态码,对这2个数据不进行任何翻转操作
            {
                temp_data_str = temp_data;
            }
            else {
                //数据翻转
                temp_data_str = reverse(meter_read_data.slice(position, position + data_len[index]));
            }
        }
        if (data_struct[item_id] in data_precision) {
            //数据乘以对应的变量获得解析结果
            if((data_struct[item_id] == "heat_power") && (temp_data_str == "FFFFFFFF"))
            //如果heat_power的数据为FFFFFFFF，此时heat_power数据置零
            {
                tmpval = 0;
            }
            else if(data_struct[item_id] == "flow") //瞬时流量保留3位小数
                {
                    tmpval = parseFloat(parseFloat(temp_data_str) * data_precision[data_struct[item_id]]).toFixed(3); //保留3位小数
                    //这里必须要明确小数点后的数据长度，否则，在正确的数据后面会出现很多冗余数据，小数点后保留三位小数也是为了保证精度
                }

                else
                {
                    tmpval = parseFloat(parseFloat(temp_data_str) * data_precision[data_struct[item_id]]);
                }
                decoded_str[data_struct[item_id]] = tmpval; //数据添加到decoded_str对应的属性中
        }
        //判断是否能找到带有“_unit”字符串的标志位，即表示该数据为单位
        //不能用 else if(data_struct.indexOf("_unit") != -1)  这样会出不来正确的结果
        else if (data_struct[item_id].indexOf("_unit") != -1) {
            decoded_str[data_struct[item_id]] = unit_dict[temp_data_str]; //读取188协议单位列表，并添加到decoded_str的相应属性中去。
        }
        else {
            if (data_struct[item_id] == "meter_type") {
                //判断meter_type第一位的大小来判断表具类型
                //10H~19H :水表，20H~29H:热量表，30H~39H:燃气表，40H~49H:其他仪表
                switch (temp_data_str[0]) {
                    case "1" :
                        decoded_str[data_struct[item_id]] = meter_type[0];
                        break; //case后面的内容必须要加引号，因为这是一个字符比较，不是数字比较
                    case "2" :
                        decoded_str[data_struct[item_id]] = meter_type[1];
                        break;
                    case "3" :
                        decoded_str[data_struct[item_id]] = meter_type[2];
                        break;
                    case "4" :
                        decoded_str[data_struct[item_id]] = meter_type[3];
                        break;
                    default :
                        break;
                }
            }
            //判断是否为状态位
            else if (data_struct[item_id] == "status") {
                decoded_str[data_struct[item_id]] = status_judge(temp_data_str);//解析后的状态添加到decoded_str的相应属性中去
            }
            else if(data_struct[item_id] == "meter_code") //如果是表地址，如：11110059200991，只截取后8位表号，前几位固定地址去掉
            {
                   if(meter_code_order == "normal")
                   {
                       decoded_str[data_struct[item_id]] = temp_data_str.substring(temp_data_str.length - meter_code_len); //截取表号，后面省去，数据添加到decoded_str对应的属性中
                   }
                   else
                   {
                       decoded_str[data_struct[item_id]] = temp_data_str.substring(0, meter_code_len);
                   }
            }
            else {
                decoded_str[data_struct[item_id]] = temp_data_str; //即不是单位，也不是需要解析的数据，直接添加转欢后的结果到decoded_str的相应属性中去
            }
        }
        position += data_len[index];  //position根据数据字节数不断改变
        item_id += 1;                 //item_id自增1
    }
    // console.log(position);
    return decoded_str;    //返回解析后的数据
    //console.log(data_len);
    //console.log(decoded_str);
}
//console.log(dataParse(meter_data_str));
//console.log( data_status_bits.byte2["128"]);
//for(var i = 0;i<5 ;i++)
//{
//  console.log(dataParse(meter_data_str));
//}