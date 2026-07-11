# 🚀 Java 本地运行服务器 v2.1

> 使用场景：网页编写Java代码，一键运行即时查看运行结果，支持Scanner交互，适合初学者不需要代码提示的场景

---

## 💡 项目初衷

不废话了，就是初学java的时候，看韩顺平老师的视频中反反复复调用 javac 编译和 java 运行，麻烦且还没法实时看到代码和执行效果，学习前期又不能使用idea的代码提示，在线的[菜鸟教程在线编辑器](https://www.runoob.com/try/runcode.php?filename=HelloWorld&type=java)又用不了Scanner，干脆写一个本地的java代码网页执行用用。


## 📋 环境要求

### 1. 安装 JDK 和 Python

- 已安装 **JDK**（推荐 17+）
- 已安装 **Python 3.10+**

### 2. 配置环境

配置主要是 python 环境：

```bash
cd main
pip install -r requirements.txt
```


## ⚡ 启动项目

> [!WARNING]
> 这是一个本地程序，请不要在公网服务器运行！

**方式一：命令行启动**

```bash
cd main
python server.py
```

运行后浏览器打开 **http://localhost:5000**，就能看到UI界面：

**方式二：双击启动**

双击 `start.bat` 运行脚本，弹出黑框后浏览器打开 **http://localhost:5000** 即可。

![默认界面](./attachments/README/image-20260709224356306.png)


## 🎯 快速上手

1. 左边编辑器写 Java 代码
2. 按 `Ctrl+Enter`（或点击「▶ 运行」）
3. 右边控制台看输出，右侧底部能输入 Scanner 可接收的字符串或者整型

![代码执行](./attachments/README/image-20260709210903601.png)


## 🖥️ 界面说明

### 顶部导航栏

如下图，主要分为三个小按钮：

![顶部导航](./attachments/README/image-20260709213239863.png)

### 主界面

UI 详细功能如下图：

![前端UI详细注释图](./attachments/README/image-20260708180142565.png)

**优先说明：**

- `自动包装`：帮你省掉 `public class xxx{public static void main(String[] args){}}` 这个框架，可以直接写代码并执行，如下图。`自动包装` 模式目的就一个——省点时间，多学点知识。

![裸代码运行](./attachments/README/image-20260709212915370.png)

**运行模式：**

| 序号 | 模式 | 说明 |
|:---:|------|------|
| 1 | 临时单文件 | 只需要在一个文件内写代码 |
| 2 | 临时多文件 | 在项目的临时文件夹下写多个代码，为后面类与对象的学习做准备 |
| 3 | 项目开发 | 加载一个项目目录，其他项目文件夹可以以此形式加入 |

### 设置界面

设置页面的UI说明如下：

![打开设置](./attachments/README/image-20260709210534794.png)

| 模式 | 说明 |
|------|------|
| 环境模式 | 默认从全局环境中读取 `java` 和 `javac` |
| 路径模式 | 从选中的地址中读取 `java` 和 `javac` |
| 相对路径模式 | 从项目的 `jdk` 文件夹读取 `java` 和 `javac`，要求正确命名且 `bin` 文件夹在 JDK 目录下 |

具体详情请看前端的设置界面。
