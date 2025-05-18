document.addEventListener("DOMContentLoaded", function () {
  let worker = null;

  const TOTAL_CIRCLES = 25 * 25; // 625 circles.

  const gridNoEarly = document.getElementById("gridNoEarly");
  const gridEarly = document.getElementById("gridEarly");
  const toggleBtn = document.getElementById("toggleBtn");
  const noEarlyCounter = document.getElementById("noEarlyCounter");
  const earlyCounter = document.getElementById("earlyCounter");

  const durationSlider = document.getElementById("durationSlider");
  const checkFrequencySlider = document.getElementById("checkFrequencySlider");
  const alphaSlider = document.getElementById("alphaSlider");

  const durationValue = document.getElementById("durationValue");
  const checkFrequencyValue = document.getElementById("checkFrequencyValue");
  const alphaValue = document.getElementById("alphaValue");
  const alphaText = document.getElementById("alphaDecimalValue");
  const alphaPercentText = document.getElementById("alphaPercentValue");

  const fullDurationEls = document.querySelectorAll(".title:first-child");

  let config = {
    duration: 30,
    checkFrequency: 1,
    checkEveryVisitor: false,
    visitorsPerVariantPerDay: 250,
    conversionRate: 10,
    alpha: 5, // 0.05
  };

  function updateUI() {
    durationValue.textContent = `${config.duration} days`;
    if (config.checkFrequency === 0) {
      checkFrequencyValue.textContent = `After every visit`;
      config.checkEveryVisitor = true;
    } else {
      checkFrequencyValue.textContent = `Every ${config.checkFrequency} day${
        config.checkFrequency > 1 ? "s" : ""
      }`;
      config.checkEveryVisitor = false;
    }
    const alpha = config.alpha / 100;
    alphaValue.textContent = `${alpha.toFixed(2)} (${
      100 - config.alpha
    }% confidence)`;
    fullDurationEls[0].textContent = `Waiting for full ${config.duration} days`;
    alphaText.textContent = alpha.toFixed(2);
    alphaPercentText.textContent = `${config.alpha}%`;
  }

  durationSlider.addEventListener("input", function () {
    config.duration = parseInt(this.value);
    updateUI();
  });

  checkFrequencySlider.addEventListener("input", function () {
    config.checkFrequency = parseInt(this.value);
    updateUI();
  });

  alphaSlider.addEventListener("input", function () {
    config.alpha = parseInt(this.value);
    updateUI();
  });

  updateUI();

  function createGrid(gridElement) {
    gridElement.innerHTML = "";
    for (let i = 0; i < TOTAL_CIRCLES; i++) {
      const circle = document.createElement("div");
      circle.classList.add("circle");
      circle.setAttribute("tabindex", "0");
      gridElement.appendChild(circle);
    }
    return gridElement.querySelectorAll(".circle");
  }

  let noEarlyCircles = createGrid(gridNoEarly);
  let earlyCircles = createGrid(gridEarly);
  let animationRunning = false;

  function toggleAnimation() {
    if (animationRunning) {
      resetGrids();
      toggleBtn.textContent = "Start simulation";
      animationRunning = false;
      if (worker) {
        worker.terminate();
        worker = null;
      }
    } else {
      startSimulation();
      toggleBtn.textContent = "Reset";
    }
  }

  let noEarlyIndex = 0;
  let earlyIndex = 0;
  let noEarlyFalsePositives = 0;
  let earlyFalsePositives = 0;

  function startSimulation() {
    noEarlyCounter.textContent = "";
    earlyCounter.textContent = "";
    noEarlyIndex = 0;
    earlyIndex = 0;
    noEarlyFalsePositives = 0;
    earlyFalsePositives = 0;
    animationRunning = true;
    if (!worker) {
      worker = new Worker("simulationWorker.js");
      worker.onmessage = function (e) {
        if (e.data.type === "simulation_complete") {
          const { gridType, result } = e.data;
          if (gridType === "noEarly") {
            handleNoEarlyResult(result);
          } else if (gridType === "early") {
            handleEarlyResult(result);
          }
        }
      };
    }
    requestNoEarlySimulation();
    requestEarlySimulation();
  }

  function requestNoEarlySimulation() {
    if (!animationRunning || noEarlyIndex >= TOTAL_CIRCLES) return;
    worker.postMessage({
      type: "simulate_single",
      config: config,
      stopEarly: false,
      gridType: "noEarly",
      index: noEarlyIndex,
    });
  }

  function requestEarlySimulation() {
    if (!animationRunning || earlyIndex >= TOTAL_CIRCLES) return;
    worker.postMessage({
      type: "simulate_single",
      config: config,
      stopEarly: true,
      gridType: "early",
      index: earlyIndex,
    });
  }

  function handleNoEarlyResult(result) {
    noEarlyFalsePositives = updateGrid(
      result,
      noEarlyCircles,
      noEarlyIndex,
      noEarlyCounter,
      noEarlyFalsePositives,
      true
    );
    noEarlyIndex++;
    if (noEarlyIndex < TOTAL_CIRCLES) {
      requestNoEarlySimulation();
    }
  }

  function handleEarlyResult(result) {
    earlyFalsePositives = updateGrid(
      result,
      earlyCircles,
      earlyIndex,
      earlyCounter,
      earlyFalsePositives,
      false
    );
    earlyIndex++;
    if (earlyIndex < TOTAL_CIRCLES) {
      requestEarlySimulation();
    }
  }

  function updateGrid(
    result,
    circles,
    index,
    counter,
    falsePositives,
    isNoEarlyStopping
  ) {
    if (!animationRunning) return falsePositives;
    // Update the circle.
    if (result.isFalsePositive) {
      circles[index].classList.add("false-positive");
      falsePositives++;
    } else {
      circles[index].classList.add("true-negative");
    }
    // Add tooltip.
    circles[index].setAttribute(
      "aria-label",
      createTooltipContent(result, isNoEarlyStopping)
    );
    // Update counter.
    const percent = ((falsePositives / (index + 1)) * 100).toFixed(1);
    counter.innerHTML = `<span class="percent">${percent}% false positives</span> <span class="details">(${falsePositives} out of ${TOTAL_CIRCLES})</span>`;
    return falsePositives;
  }

  function createTooltipContent(result, isNoEarlyStopping) {
    const rateA = parseFloat(result.conversionRateA);
    const rateB = parseFloat(result.conversionRateB);
    let diffDisplay;
    if (rateA === 0 && rateB > 0) {
      diffDisplay = "∞%";
    } else if (rateA === 0 && rateB === 0) {
      diffDisplay = "0%";
    } else {
      const relDiff = ((rateB - rateA) / rateA) * 100;
      diffDisplay = `${relDiff > 0 ? "+" : ""}${relDiff.toFixed(1)}%`;
    }
    const outcome = result.isFalsePositive ? "❌ False positive" : "✅ Valid result";
    // Tooltip content.
    return (
      `${outcome}\n` +
      `• Difference in CR: ${diffDisplay}\n` +
      `• ${formatPValue(result.pValue)}\n` +
      `• ${isNoEarlyStopping ? "Test completed" : "Stopped"} ${
        result.stoppedAt
      }\n` +
      `• Total samples: ${result.totalVisitors} visitors`
    );
  }

  function formatPValue(pValue) {
    if (pValue < 0.001) {
      return "p < 0.001";
    } else {
      return `p = ${pValue.toFixed(3)}`;
    }
  }

  function resetGrids() {
    noEarlyCircles.forEach((circle) => {
      circle.classList.remove("false-positive", "true-negative");
      circle.removeAttribute("aria-label");
    });

    earlyCircles.forEach((circle) => {
      circle.classList.remove("false-positive", "true-negative");
      circle.removeAttribute("aria-label");
    });

    noEarlyCounter.textContent = "";
    earlyCounter.textContent = "";
  }

  toggleBtn.addEventListener("click", toggleAnimation);
});
