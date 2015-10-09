var SerialPort = require("serialport"); //引入串口模块
var iconv = require('iconv-lite');  //引入数据编码格式转换模块
var http = require('http');   //引入http模块
var express = require('express'); //引入express模块
var sio = require('socket.io'); //引入socket.io模块
var app = express();  //创建express实例
var path = require('path');  //引入path模块
var fs = require('fs');  //引入fs模块
var server = http.createServer(app);
server.listen(2212);//监听2212端口

if ((typeof sp) != 'undefined') {
    sp.setMaxListeners(20);
}

app.use(express.static(path.join(__dirname, 'public'))); //设置public文件夹为静态资源文件夹,必须建立否则js和css无法加载
app.get('/', function (req, res) {
    res.sendFile(__dirname + '/command_1.1.html');
});   //设置路由，当客户端请求'/'时，发送文件command.html
app.post('/command_1.1.html', function (req, res) {
    req.on("data", function (data) {
        res.send(data);
    });
});


var socket = sio.listen(server);
var rec_setting = '';  //接收编码方式
var send_setting = '';  //发送编码方式
var send_times = 0;  //记录页面点击发送的次数
var sp;  //定义一个全局变量，接收创建的端口
//监听connection事件
socket.on('connection', function (socket) {
    console.log('与客户端的命令连接通道已经建立');

    SerialPort.list(function (err, ports) {
        ports.forEach(function (port) {
            //console.log(port.comName);
            serials_to_web(port.comName);
        });
    });
    /************************************获取串口配置信息*************************************/
    socket.on('serial_info', function (data)  //获取串口信息
        {
            com_num = data.com_num;  //串口号
            baudrate = parseInt(data.baudrate);  //波特率
            databits = parseInt(data.databits);  //数据位
            stopbits = parseInt(data.stopbits);  //停止位
            parity = data.parity;                //校验
            serial_flag = data.serial_flag;   //串口状态标志位


            if (serial_flag == "close") {
                if ((typeof sp) != 'undefined') {
                    if(sp.isOpen())
                    {
                        sp.close(function (err) {
                            if (err) throw err;
                            else {
                                console.log('串口已经关闭');
                                data_to_web('串口已经关闭');
                            }
                        });
                    }
                }
            }
        }
    );
//说明：串口实现可以重复打开关闭的思路是：如果关闭串口按钮按下，推送串口信息（起始只需要推送串口状态标志位就可以了）到服务器，服务器判断串口信息，
// 如果是关闭串口的操作的话，sp.close()来关闭串口连接，同时更改上一次打开的串口的串口号（这个串口号必须要改，否则没办法继续下一次打开关闭串口的操作），
// 更改了上次打开的串口号之后，下次打开串口直接重新开一个端口就可以了，这样就不会出现'Eroor:SerialPort is not open'的错误了。

    socket.on('meterReading', function (data) {
        //监听meterReading事件 获取数据
        send_times++;
        rec_setting = data.rec_setting;           //接收编码
        send_setting = data.send_setting;         //发送编码
        if (data.auto_time != "")  //如果发送时间为空，则发送时间为0
        {
            auto_time = parseInt(data.auto_time);
        }
        else {
            auto_time = 0;
        }
        auto_send = data.auto_send;     //是否自动抄表
        command = data.command;        //指令
        //   console.log(rec_setting);

        send_juge();

        if (send_times == 1)  //当页面第一次进行数据发送时，就打开监听，此后监听就一直开启，不应该多次打开，打开一次就够了
        {
            socket.on('disconnect', function () {
                //监听disconnect事件
                console.log('已经断开命令通道连接！');
            });
            socket.on('error', function (err) {
                if (err) {
                    console.log(err);
                }
            })
        }

    });

    //接收编码的更改
    socket.on('encode_setting', function (data) {
        rec_setting = data.rec_setting;           //接收编码
        send_setting = data.send_setting;         //发送编码
    });
});


/*************************************推送接收的数据到网页页面*************************************/
function data_to_web(rec_data) {
    socket.emit('data_to_web', rec_data);   //‘发送’ data_to_web 事件
}

/******************************************推送串口信息到网页页面*************************************/
function serials_to_web(data) {
    socket.emit('serials_to_web', data);
}


/*********************************串口数据发送和接收***********************************************/
function serial_read_write(write_data, auto_send_time)    //串口操作
{
    if (serial_flag != 'close') {
        //sp是用来记录创建的serialPort的
        if ((typeof sp) != 'undefined') {
            if (sp.isOpen()) {
                if (sp.path != com_num)  //sp有数据，且sp记录打开的串口号和即将创建的串口号不同
                {
                    //sp.close(function (err) {
                    //    if (err) throw err;
                    //});
                    open_serial();  //打开端口
                    open_wr(); //新创建的端口必须要先打开端口（sp.on('open',callback)）才能进行数据读写
                }
                else {   //这种情况就是打开串口之后一直进行发送操作
                    if (send_times == 1) //第一次进行发送，此时打开读写同时打开监听
                    {
                        write_read(); //端口已经创建，直接读写就可以，因为上一次创建端口时已经打开了端口，若此时继续打开端口，sp.on（'open',callback）内部的代码不会执行
                    }
                    else   //已经打开读监听了，如果继续打开，发送多次之后会出现“(node) warning: possible EventEmitter memory leak detected. 11 data listeners added. Use emitter.setMaxListeners() to increase limit.”的警告
                    //所以此时不需要再次打开监听，只需要进行数据发送就可以了。
                    {
                        serial_write();
                    }
                }
            }
            else {
                open_serial();  //打开端口
                open_wr();
            }
        }
        else   //sp没有数据，则直接打开串口
        {
            open_serial();
            open_wr();
        }
    }
    /************************************打开串口并读写数据*********************************/
    function open_wr() {
        sp.on("open", function (err) {
            if (err) {
                console.log(err + "打开串口出错，请重试");
            }
            else {
                console.log('串口已经打开');
                serial_read();
                serial_write();
            }
        });
    }

    /*****************************************读写数据***************************************/
    function write_read() {
        serial_read();
        serial_write();
    }

    /****************************读串口************************************************/
    function serial_read() {
        sp.on('data', function (info) {
            console.log('data_change:' + iconv.decode(info, rec_setting));
            data_to_web(iconv.decode(info, rec_setting));
            data_to_web('接收数据字节长度：' + info.length);
        });
    }

    /****************************写串口************************************************/
    function serial_write() {
        var buf_once = new Buffer(write_data, send_setting);
        sp.write(buf_once, function (err, results) {
            if (err) {
                console.log('err ' + err);
            }
            else {
                data_to_web('发送数据：' + write_data.toLocaleUpperCase());
                data_to_web('发送数据字节长度： ' + results);
                console.log('发送数据:' + write_data.toLocaleUpperCase());
                console.log('发送数据字节长度： ' + results);  //发出去的数据字节长度
            }
        });
        if (auto_send_time != 0) {
            var autoSend = setInterval(function () {
                if (serial_flag != 'close') {
                    var buf = new Buffer(write_data, send_setting);
                    sp.write(buf, function (err, results) {
                        if (err) {
                            console.log('err ' + err);
                        }
                        else {
                            data_to_web('发送数据：' + write_data.toLocaleUpperCase());
                            data_to_web('发送数据字节长度： ' + results);
                            console.log('发送数据:' + write_data.toLocaleUpperCase());
                            console.log('发送数据字节长度： ' + results);  //发出去的数据字节长度
                        }
                    })
                }
                else {
                    clearInterval(autoSend);
                }
            }, auto_send_time);
        }
    }

    /**********************************创建串口***************************************/
    function open_serial() {
        var serialPort = new SerialPort.SerialPort(com_num, {
            baudrate: baudrate,  //波特率设置
            databits: databits,  //数据位
            parity: parity,  //校验位
            stopbits: stopbits //停止位
            //  parser: SerialPort.parsers.readline("\n")  //这句可能调用方法不对，加上这句就会出现接收数据编码不正常
        });
        data_to_web('串口已经打开');
        sp = serialPort;
    }

    /**********************************创建串口***************************************/

}

/****************************************发送状态判断*******************************************/
function send_juge() {
    //命令手动发送条件
    if (command != "" && auto_send == "auto_send_no") //发送命令手动抄表
    {
        serial_read_write(command, 0);
    }
    //命令自动发送
    if (command != "" && auto_send == "auto_send_yes") //定时自动抄表
    {
        serial_read_write(command, auto_time);
    }
}
