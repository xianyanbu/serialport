# 基于Node.js的串口调试助手
**说明**：该程序通过node.js方法实现对串口进行读写。进行node.js的串口程序开发，必须安装node.js下的串口开发控件‘serialport’。
**安装**： `npm install serialport`
    ![串口调试助手界面](/2015-10-09_114116.png)
***
## 1.创建串口
```javascript
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
    ```
  **说明**：通过该方法创建串口。注意创建窗口的时候串口号是必要条件，否则就会报错，无法创建端口。
***
## 2.读端口数据
         function serial_read() {
               sp.on('data', function (info) {
               console.log('data_change:' + iconv.decode(info, rec_setting));
               data_to_web(iconv.decode(info, rec_setting));
               data_to_web('接收数据字节长度：' + info.length);
           });
           }
**说明**：通过该方法读取串口数据。
***
## 3.写端口数据
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
**说明**：通过该方法向串口写入数据。因为在实际串口调试中存在单次发送和定时连续发生，所以这里也对这两种情况做了区分。当然，当我们点下发送按钮的时候，必须立马有一条数据发出，所以如这个方法里面的代码所示，调用该方法的时候我首先会先发送一次数据。这样做的好处是避免延时现象，比如我要间隔2s定时发送数据，那么当发送按钮点击完成，2s后才会开始发送数据。
***
## 4.数据发送方式判断
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
 ***
 ## 5.其他
 这里面还有其它的方法和逻辑判断，这里不一一细说，在程序里面都有相应的注释。在web端运用了多个ajax推送页面信息到后台服务的事件，这里只给出一个示例说明：
 
    $(function()
          {
              $('#set_change').click(function()
              {
                  rec_setting = $("#rec_setting").find('option:selected').val();//获取接收编码
                  send_setting = $("#send_setting").find('option:selected').val();//获取发送编码
                  var encode_set = {
                      rec_setting: rec_setting,
                      send_setting: send_setting
                  };
                  var JSON_encode = JSON.stringify(encode_set);  //将js对象转换成json格式数据
                  $.ajax({
                      type: 'post',
                      url: "command_1.1.html",
                      data: JSON_encode,
                      async: true,
                      // dataType: 'json',
                      success: function (data) {
                          // alert(data);
                      },
                      error: function (XMLHttpRequest, textStatus, errorThrown) {
                          // alert("Save error!" + XMLHttpRequest.status + " "  + XMLHttpRequest.readyState);
                          alert("指令发送失败，请检查服务器是否运行正常！")
                      }
                  });
                  connect_toserver.emit('encode_setting', encode_set);
              })
          });
**说明**：这个方法是推送编码设置到后台程序。
