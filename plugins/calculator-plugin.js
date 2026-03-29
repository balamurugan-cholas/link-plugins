/**
 * Simple Calculator Plugin
 * Adds a basic math tool to the Sidebar
 */

export const init = (api) => {
  // 1. Create the UI element
  const calcContainer = document.createElement('div');
  calcContainer.id = 'plugin-calculator';
  calcContainer.style.padding = '15px';
  calcContainer.style.borderTop = '1px solid #333';
  calcContainer.innerHTML = `
    <h4 style="margin: 0 0 10px 0; font-size: 12px; color: #888;">CALCULATOR</h4>
    <input type="text" id="calc-display" readonly 
           style="width: 100%; background: #1a1a1a; border: 1px solid #444; color: #fff; padding: 5px; text-align: right; margin-bottom: 5px; border-radius: 4px;">
    <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px;">
      ${['7','8','9','/','4','5','6','*','1','2','3','-','0','.','=','+'].map(btn => 
        `<button class="calc-btn" style="padding: 5px; background: #333; color: white; border: none; cursor: pointer; border-radius: 2px;">${btn}</button>`
      ).join('')}
      <button id="calc-clear" style="grid-column: span 4; padding: 5px; background: #b91c1c; color: white; border: none; margin-top: 4px; border-radius: 2px;">Clear</button>
    </div>
  `;

  // 2. Add Logic
  let currentInput = "";
  const display = calcContainer.querySelector('#calc-display');

  calcContainer.querySelectorAll('.calc-btn').forEach(button => {
    button.addEventListener('click', () => {
      const val = button.innerText;
      if (val === '=') {
        try {
          currentInput = eval(currentInput).toString();
        } catch {
          currentInput = "Error";
        }
      } else {
        currentInput += val;
      }
      display.value = currentInput;
    });
  });

  calcContainer.querySelector('#calc-clear').addEventListener('click', () => {
    currentInput = "";
    display.value = "";
  });

  // 3. Inject into the Sidebar using your App's API
  // Note: Adjust 'sidebar-bottom' to match the ID of your sidebar container
  const sidebar = document.getElementById('sidebar-content'); 
  if (sidebar) {
    sidebar.appendChild(calcContainer);
  }

  console.log("Calculator Plugin Loaded Successfully!");
};
