function normCDF(x) {
    const b1 =  0.319381530;
    const b2 = -0.356563782;
    const b3 =  1.781477937;
    const b4 = -1.821255978;
    const b5 =  1.330274429;
    const p  =  0.2316419;
    const c  =  0.39894228;
    if (x >= 0.0) {
        const t = 1.0 / (1.0 + p * x);
        return (1.0 - c * Math.exp(-x * x / 2.0) * t *
            (t * (t * (t * (t * b5 + b4) + b3) + b2) + b1));
    } else {
        const t = 1.0 / (1.0 - p * x);
        return (c * Math.exp(-x * x / 2.0) * t *
            (t * (t * (t * (t * b5 + b4) + b3) + b2) + b1));
    }
}

function simulateTest(config, stopEarly) {
    const baseConversionRate = config.conversionRate / 100;
    const significanceLevel = config.alpha / 100;
    const sampleSize = Math.max(10, Math.ceil(config.visitorsPerVariantPerDay));
    const totalDays = config.duration;
    const checkInterval = config.checkFrequency;
    const trueEffect = 0;
    let runningSumA = 0;
    let runningCountA = 0;
    let runningSumB = 0;
    let runningCountB = 0;
    for (let day = 0; day < totalDays; day++) {
        for (let visitor = 0; visitor < sampleSize; visitor++) {
            const probA = baseConversionRate;
            const probB = baseConversionRate + trueEffect; // trueEffect is 0.
            const conversionA = (Math.random() < probA) ? 1 : 0;
            const conversionB = (Math.random() < probB) ? 1 : 0;
            runningSumA += conversionA;
            runningCountA++;
            runningSumB += conversionB;
            runningCountB++;
            if (stopEarly && config.checkEveryVisitor && runningCountA > 20) {
                const result = checkSignificance(runningSumA, runningCountA, runningSumB, runningCountB, significanceLevel);
                if (result.isSignificant) {
                    return {
                        isFalsePositive: true,
                        stoppedAt: `after ${runningCountA} visitors`,
                        pValue: result.pValue,
                        conversionRateA: result.conversionRateA,
                        conversionRateB: result.conversionRateB,
                        totalVisitors: runningCountA * 2
                    };
                }
            }
        }
        if (stopEarly && !config.checkEveryVisitor && (day + 1) % checkInterval === 0 && runningCountA > 0) {
            const result = checkSignificance(runningSumA, runningCountA, runningSumB, runningCountB, significanceLevel);
            if (result.isSignificant) {
                return {
                    isFalsePositive: true,
                    stoppedAt: `after ${day + 1} days`,
                    pValue: result.pValue,
                    conversionRateA: result.conversionRateA,
                    conversionRateB: result.conversionRateB,
                    totalVisitors: runningCountA * 2
                };
            }
        }
    }

    if (runningCountA === 0) {
         return {
            isFalsePositive: false,
            stoppedAt: `after full ${totalDays} days (no data)`,
            pValue: 1.0,
            conversionRateA: "N/A",
            conversionRateB: "N/A",
            totalVisitors: 0
        };
    }

    const finalResult = checkSignificance(runningSumA, runningCountA, runningSumB, runningCountB, significanceLevel);

    return {
        isFalsePositive: finalResult.isSignificant,
        stoppedAt: `after full ${totalDays} days`,
        pValue: finalResult.pValue,
        conversionRateA: finalResult.conversionRateA,
        conversionRateB: finalResult.conversionRateB,
        totalVisitors: runningCountA * 2
    };
}

function checkSignificance(runningSumA, runningCountA, runningSumB, runningCountB, significanceLevel) {
    const meanA = runningSumA / runningCountA;
    const meanB = runningSumB / runningCountB;
    const varA = meanA * (1 - meanA);
    const varB = meanB * (1 - meanB);
    const se = Math.sqrt(varA / runningCountA + varB / runningCountB);
    let pValue = 1.0;
    if (se > 0) {
        const diff = meanB - meanA;
        const z = Math.abs(diff) / se;
        pValue = 2 * (1 - normCDF(z));
    } else if (meanA !== meanB) {
        pValue = 0.0;
    }
    return {
        isSignificant: pValue < significanceLevel,
        pValue: pValue,
        conversionRateA: (meanA * 100).toFixed(1),
        conversionRateB: (meanB * 100).toFixed(1)
    };
}

self.onmessage = function(e) {
    if (e.data.type === 'simulate_single') {
        const { config, stopEarly, gridType, index } = e.data;
        const result = simulateTest(config, stopEarly);
        self.postMessage({
            type: 'simulation_complete',
            gridType: gridType,
            index: index,
            result: result
        });
    }
};
