@rem
@rem Copyright 2015 the original author or authors.
@rem
@rem Licensed under the Apache License, Version 2.0 (the "License");
@rem you may not use this file except in compliance with the License.
@rem You may obtain a copy of the License at
@rem
@rem      https://www.apache.org/licenses/LICENSE-2.0
@rem
@rem Unless required by applicable law or agreed to in writing, software
@rem distributed under the License is distributed on an "AS IS" BASIS,
@rem WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
@rem See the License for the specific language governing permissions and
@rem limitations under the License.
@rem

@if "%DEBUG%" == "" @echo off
@rem ##########################################################################
@rem
@rem  client_testing startup script for Windows
@rem
@rem ##########################################################################

@rem Set local scope for the variables with windows NT shell
if "%OS%"=="Windows_NT" setlocal

set DIRNAME=%~dp0
if "%DIRNAME%" == "" set DIRNAME=.
set APP_BASE_NAME=%~n0
set APP_HOME=%DIRNAME%..

@rem Resolve any "." and ".." in APP_HOME to make it shorter.
for %%i in ("%APP_HOME%") do set APP_HOME=%%~fi

@rem Add default JVM options here. You can also use JAVA_OPTS and CLIENT_TESTING_OPTS to pass JVM options to this script.
set DEFAULT_JVM_OPTS=

@rem Find java.exe
if defined JAVA_HOME goto findJavaFromJavaHome

set JAVA_EXE=java.exe
%JAVA_EXE% -version >NUL 2>&1
if "%ERRORLEVEL%" == "0" goto execute

echo.
echo ERROR: JAVA_HOME is not set and no 'java' command could be found in your PATH.
echo.
echo Please set the JAVA_HOME variable in your environment to match the
echo location of your Java installation.

goto fail

:findJavaFromJavaHome
set JAVA_HOME=%JAVA_HOME:"=%
set JAVA_EXE=%JAVA_HOME%/bin/java.exe

if exist "%JAVA_EXE%" goto execute

echo.
echo ERROR: JAVA_HOME is set to an invalid directory: %JAVA_HOME%
echo.
echo Please set the JAVA_HOME variable in your environment to match the
echo location of your Java installation.

goto fail

:execute
@rem Setup the command line

set CLASSPATH=%APP_HOME%\lib\client_testing-1.0-SNAPSHOT.jar;%APP_HOME%\lib\client-2.2.1.jar;%APP_HOME%\lib\commons-cli-1.4.jar;%APP_HOME%\lib\log4j-slf4j-impl-2.14.1.jar;%APP_HOME%\lib\log4j-core-2.14.1.jar;%APP_HOME%\lib\log4j-api-2.14.1.jar;%APP_HOME%\lib\gson-2.8.6.jar;%APP_HOME%\lib\commons-lang-2.6.jar;%APP_HOME%\lib\codegen-4.8.4.jar;%APP_HOME%\lib\core-4.8.4.jar;%APP_HOME%\lib\Java-WebSocket-1.4.1.jar;%APP_HOME%\lib\crypto-4.8.4.jar;%APP_HOME%\lib\slf4j-api-1.7.30.jar;%APP_HOME%\lib\logging-interceptor-4.9.0.jar;%APP_HOME%\lib\okhttp-4.9.0.jar;%APP_HOME%\lib\moshi-adapters-1.11.0.jar;%APP_HOME%\lib\moshi-1.11.0.jar;%APP_HOME%\lib\okio-jvm-2.9.0.jar;%APP_HOME%\lib\commons-codec-1.15.jar;%APP_HOME%\lib\commons-lang3-3.1.jar;%APP_HOME%\lib\cache2k-core-1.6.0.Final.jar;%APP_HOME%\lib\cache2k-api-1.6.0.Final.jar;%APP_HOME%\lib\jsr305-3.0.2.jar;%APP_HOME%\lib\kotlinpoet-1.5.0.jar;%APP_HOME%\lib\kotlin-stdlib-jdk8-1.4.10.jar;%APP_HOME%\lib\kotlin-reflect-1.3.61.jar;%APP_HOME%\lib\kotlin-stdlib-jdk7-1.4.10.jar;%APP_HOME%\lib\kotlin-stdlib-1.4.10.jar;%APP_HOME%\lib\annotations-17.0.0.jar;%APP_HOME%\lib\json-simple-1.1.1.jar;%APP_HOME%\lib\kotlin-stdlib-common-1.4.10.jar;%APP_HOME%\lib\abi-4.8.4.jar;%APP_HOME%\lib\tuples-4.8.4.jar;%APP_HOME%\lib\jnr-unixsocket-0.21.jar;%APP_HOME%\lib\rxjava-2.2.2.jar;%APP_HOME%\lib\jackson-databind-2.10.0.jar;%APP_HOME%\lib\javapoet-1.7.0.jar;%APP_HOME%\lib\picocli-3.0.0.jar;%APP_HOME%\lib\junit-platform-launcher-1.5.2.jar;%APP_HOME%\lib\junit-jupiter-engine-5.5.2.jar;%APP_HOME%\lib\junit-vintage-engine-5.5.2.jar;%APP_HOME%\lib\junit-4.12.jar;%APP_HOME%\lib\rlp-4.8.4.jar;%APP_HOME%\lib\utils-4.8.4.jar;%APP_HOME%\lib\jnr-enxio-0.19.jar;%APP_HOME%\lib\jnr-posix-3.0.47.jar;%APP_HOME%\lib\jnr-ffi-2.1.9.jar;%APP_HOME%\lib\jnr-constants-0.9.11.jar;%APP_HOME%\lib\reactive-streams-1.0.2.jar;%APP_HOME%\lib\jackson-annotations-2.10.0.jar;%APP_HOME%\lib\jackson-core-2.10.0.jar;%APP_HOME%\lib\junit-platform-engine-1.5.2.jar;%APP_HOME%\lib\junit-jupiter-api-5.5.2.jar;%APP_HOME%\lib\junit-platform-commons-1.5.2.jar;%APP_HOME%\lib\apiguardian-api-1.1.0.jar;%APP_HOME%\lib\bcprov-jdk15on-1.65.jar;%APP_HOME%\lib\jffi-1.2.17.jar;%APP_HOME%\lib\jffi-1.2.17-native.jar;%APP_HOME%\lib\asm-commons-5.0.3.jar;%APP_HOME%\lib\asm-analysis-5.0.3.jar;%APP_HOME%\lib\asm-util-5.0.3.jar;%APP_HOME%\lib\asm-tree-5.0.3.jar;%APP_HOME%\lib\asm-5.0.3.jar;%APP_HOME%\lib\jnr-a64asm-1.0.0.jar;%APP_HOME%\lib\jnr-x86asm-1.0.2.jar;%APP_HOME%\lib\opentest4j-1.2.0.jar;%APP_HOME%\lib\hamcrest-core-1.3.jar


@rem Execute client_testing
"%JAVA_EXE%" %DEFAULT_JVM_OPTS% %JAVA_OPTS% %CLIENT_TESTING_OPTS%  -classpath "%CLASSPATH%"  %*

:end
@rem End local scope for the variables with windows NT shell
if "%ERRORLEVEL%"=="0" goto mainEnd

:fail
rem Set variable CLIENT_TESTING_EXIT_CONSOLE if you need the _script_ return code instead of
rem the _cmd.exe /c_ return code!
if  not "" == "%CLIENT_TESTING_EXIT_CONSOLE%" exit 1
exit /b 1

:mainEnd
if "%OS%"=="Windows_NT" endlocal

:omega
