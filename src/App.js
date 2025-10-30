import React, { useState, useEffect, useRef } from 'react';
import Editor from '@monaco-editor/react';

function App() {
  const [javaCode, setJavaCode] = useState(`public class Main {
    public static void main(String[] args) {
        System.out.println("Hello from TeaVM!");
        System.out.println("Java compiled to JavaScript!");
        
        // Simple calculation
        int result = fibonacci(10);
        System.out.println("Fibonacci(10) = " + result);
    }
    
    public static int fibonacci(int n) {
        if (n <= 1) return n;
        return fibonacci(n - 1) + fibonacci(n - 2);
    }
}`);
  
  const [jsOutput, setJsOutput] = useState('');
  const [consoleOutput, setConsoleOutput] = useState('');
  const [status, setStatus] = useState('Loading...');
  const [isInitialized, setIsInitialized] = useState(false);
  const [canRun, setCanRun] = useState(false);
  
  const compilerRef = useRef(null);

  const editorOptions = {
    autoIndent: 'full',
    fontFamily: 'monospace',
    fontSize: 14,
    lineHeight: 22,
    minimap: { enabled: true },
    automaticLayout: true,
    scrollBeyondLastLine: false,
  };

  const addToConsole = (text) => {
    setConsoleOutput(prev => prev + text);
  };

  useEffect(() => {
    const initializeTeaVM = async () => {
      setStatus('Loading TeaVM...');
      addToConsole('Initializing TeaVM...\n');
      
      try {
        addToConsole('Loading WebAssembly module...\n');
        const { load } = await import('./c.js');
        const teavm = await load('/compiler.wasm');
        const compilerLib = teavm.exports;
        addToConsole('WebAssembly module loaded successfully\n');
        
        addToConsole('Creating compiler instance...\n');
        compilerRef.current = compilerLib.createCompiler();
        addToConsole('Compiler instance created\n');
        
        setStatus('Loading SDK...');
        addToConsole('Loading SDK from compile-classlib-teavm.bin...\n');
        let response = await fetch('/compile-classlib-teavm.bin');
        if (!response.ok) {
          throw new Error(`Failed to load SDK: ${response.status} ${response.statusText}`);
        }
        let arrayBuffer = await response.arrayBuffer();
        addToConsole(`SDK loaded: ${arrayBuffer.byteLength} bytes\n`);
        compilerRef.current.setSdk(new Uint8Array(arrayBuffer));
        addToConsole('SDK set successfully\n');
        
        setStatus('Loading TeaVM runtime...');
        addToConsole('Loading TeaVM runtime from runtime-classlib-teavm.bin...\n');
        response = await fetch('/runtime-classlib-teavm.bin');
        if (!response.ok) {
          throw new Error(`Failed to load TeaVM runtime: ${response.status} ${response.statusText}`);
        }
        arrayBuffer = await response.arrayBuffer();
        addToConsole(`TeaVM runtime loaded: ${arrayBuffer.byteLength} bytes\n`);
        compilerRef.current.setTeaVMClasslib(new Uint8Array(arrayBuffer));
        addToConsole('TeaVM runtime set successfully\n');
        
        setStatus('Ready to compile!');
        addToConsole('Initialization complete! Ready to compile Java code.\n');
        setIsInitialized(true);
        
      } catch (error) {
        setStatus('Error: ' + error.message);
        addToConsole('Initialization error: ' + error.message + '\n');
        addToConsole('Stack trace: ' + error.stack + '\n');
        console.error('Initialization error:', error);
      }
    };
    
    initializeTeaVM();
  }, []);

  const compileJava = async () => {
    if (!isInitialized) {
      alert('TeaVM not ready yet. Please wait for initialization.');
      return;
    }
    
    const compiler = compilerRef.current;
    setStatus('Compiling...');
    setConsoleOutput('Starting compilation...\n');
    
    try {
      const diagnostics = [];
      const listener = compiler.onDiagnostic ? compiler.onDiagnostic((diagnostic) => {
        diagnostics.push(diagnostic);
        addToConsole(`[${diagnostic.severity}] ${diagnostic.fileName}:${diagnostic.lineNumber} - ${diagnostic.message}\n`);
      }) : null;
      
      compiler.clearSourceFiles();
      compiler.addSourceFile('Main.java', javaCode);
      
      addToConsole('Source file added, compiling Java...\n');
      
      const compileResult = compiler.compile();
      
      addToConsole(`Java compilation result: ${compileResult}\n`);
      
      if (compileResult) {
        addToConsole('Generating WebAssembly and trying to execute...\n');
        
        try {
          compiler.generateWebAssembly({
            outputName: "app",
            mainClass: "Main"
          });
          
          addToConsole('WebAssembly generation completed\n');
          
          let wasmBytes = null;
          let capturedOutput = '';
          
          try {
            wasmBytes = compiler.getWebAssemblyOutputFile("app.wasm");
            if (wasmBytes && wasmBytes.length > 0) {
              addToConsole(`WebAssembly module: ${wasmBytes.length} bytes\n`);
              
              const { load } = await import('./c.js');
              const runtime = await load(wasmBytes);
              
              addToConsole('WebAssembly module loaded successfully\n');
              
              const originalLog = console.log;
              console.log = function(...args) {
                capturedOutput += args.join(' ') + '\n';
                originalLog.apply(console, args);
              };
              
              if (runtime.exports && runtime.exports.main) {
                runtime.exports.main([]);
                addToConsole('Executed WebAssembly main method\n');
              } else {
                addToConsole('No main method found in WebAssembly exports\n');
                addToConsole('Available exports: ' + Object.keys(runtime.exports).join(', ') + '\n');
              }
              
              console.log = originalLog;
              
            } else {
              addToConsole('No WebAssembly output found\n');
            }
          } catch (wasmError) {
            addToConsole(`WebAssembly execution failed: ${wasmError.message}\n`);
          }
          
          // Now set the output based on what we captured
          if (capturedOutput && capturedOutput.trim() !== '') {
            setJsOutput(capturedOutput);
            setCanRun(true);
            setStatus('WebAssembly compilation and execution successful!');
          } else {
            setJsOutput(`// Compilation successful
// WebAssembly module generated and executed
// Check the Console Output section below for results`);
            setStatus('Compilation successful (WebAssembly target)');
          }
          
        } catch (generateError) {
          setJsOutput('// TeaVM generation failed: ' + generateError.message);
          setStatus('TeaVM generation failed');
          addToConsole('TeaVM generation failed: ' + generateError.message + '\n');
        }
        
      } else {
        setJsOutput('// Java compilation failed');
        setStatus('Java compilation failed');
        addToConsole('Java compilation failed\n');
        
        if (diagnostics.length > 0) {
          addToConsole('\nDiagnostics:\n');
          diagnostics.forEach(d => {
            addToConsole(`${d.severity}: ${d.message}\n`);
          });
        }
      }
      
      if (listener && listener.destroy) {
        listener.destroy();
      }
      
    } catch (error) {
      setJsOutput('// Error: ' + error.message);
      setStatus('Compilation error: ' + error.message);
      addToConsole('Compilation error: ' + error.message + '\n');
      addToConsole('Stack trace: ' + error.stack + '\n');
      console.error('Compilation error:', error);
    }
  };

  const runCode = () => {
    if (!jsOutput || jsOutput.includes('// Compilation failed') || jsOutput.includes('// Error:')) {
      setConsoleOutput('No valid JavaScript code to run. Please compile first.');
      return;
    }
    
    setConsoleOutput('');
    
    const originalLog = console.log;
    console.log = function(...args) {
      addToConsole(args.join(' ') + '\n');
    };
    
    try {
      eval(jsOutput);
      if (consoleOutput === '') {
        setConsoleOutput('Code executed successfully (no output)');
      }
    } catch (error) {
      addToConsole('Runtime error: ' + error.message);
    }
    
    console.log = originalLog;
  };

  const clearAll = () => {
    setJavaCode(`public class Main {
    public static void main(String[] args) {
        System.out.println("Hello from TeaVM!");
    }
}`);
    setJsOutput('');
    setConsoleOutput('');
    setCanRun(false);
    setStatus(isInitialized ? 'Ready to compile!' : 'Loading...');
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">TeaVM Playground</h1>
        <div className="mb-6 text-lg text-blue-400">{status}</div>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <h3 className="text-xl font-semibold mb-2">Java Code:</h3>
            <div className="border border-gray-700 rounded-lg overflow-hidden">
              <Editor
                height="400px"
                language="java"
                theme="vs-dark"
                value={javaCode}
                onChange={(value) => setJavaCode(value || '')}
                options={editorOptions}
              />
            </div>
            
            <div className="flex gap-3 mt-4">
              <button
                onClick={compileJava}
                disabled={!isInitialized}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg font-medium transition-colors"
              >
                Compile
              </button>
              <button
                onClick={runCode}
                disabled={!canRun}
                className="px-6 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg font-medium transition-colors"
              >
                Run
              </button>
              <button
                onClick={clearAll}
                className="px-6 py-2 bg-red-600 hover:bg-red-700 rounded-lg font-medium transition-colors"
              >
                Clear
              </button>
            </div>
          </div>
          
          <div>
            <h3 className="text-xl font-semibold mb-2">JavaScript Output:</h3>
            <div className="border border-gray-700 rounded-lg overflow-hidden">
              <Editor
                height="400px"
                language="javascript"
                theme="vs-dark"
                value={jsOutput}
                options={{ ...editorOptions, readOnly: true }}
              />
            </div>
          </div>
        </div>
        
        <div className="mt-6">
          <h3 className="text-xl font-semibent mb-2">Console Output:</h3>
          <pre className="bg-gray-800 border border-gray-700 rounded-lg p-4 overflow-auto max-h-64 font-mono text-sm">
            {consoleOutput || 'No output yet...'}
          </pre>
        </div>
      </div>
    </div>
  );
}

export default App;