import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Filler,
    Legend,
    ScriptableContext
} from "chart.js";
import { Line } from "react-chartjs-2";

// Register ChartJS components
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Filler, Legend);

interface RevenueAnalyticsChartProps {
    data: number[];
    labels: string[];
    comparisonData?: number[];
    showComparison?: boolean;
}

export const RevenueAnalyticsChart = ({ data, labels, comparisonData, showComparison = true }: RevenueAnalyticsChartProps) => {
    const chartData = {
        labels: labels,
        datasets: [
            {
                label: 'Current Period',
                data: data,
                borderColor: '#0055FE',
                borderWidth: 2,
                backgroundColor: (context: ScriptableContext<"line">) => {
                    const ctx = context.chart.ctx;
                    const gradient = ctx.createLinearGradient(0, 0, 0, 300);
                    gradient.addColorStop(0, 'rgba(0, 85, 254, 0.15)'); // Slightly more visible
                    gradient.addColorStop(1, 'rgba(0, 85, 254, 0)');
                    return gradient;
                },
                fill: true,
                tension: 0.4, // Smooth curves
                pointRadius: 0,
                pointHoverRadius: 6,
                pointHoverBackgroundColor: '#0055FE',
                pointHoverBorderColor: '#FFFFFF',
                pointHoverBorderWidth: 2,
                yAxisID: 'y',
                order: 1 // Top layer
            },
            // Comparison Line
            ...(showComparison && comparisonData ? [{
                label: 'Previous Period',
                data: comparisonData,
                borderColor: '#94a3b8', // Slate 400
                borderWidth: 2,
                borderDash: [5, 5],
                backgroundColor: 'transparent',
                pointRadius: 0,
                pointHoverRadius: 4,
                tension: 0.4,
                yAxisID: 'y',
                order: 2 // Behind
            }] : [])
        ],
    };

    const options = {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
            mode: 'index' as const,
            intersect: false,
        },
        plugins: {
            legend: {
                display: true,
                position: 'top' as const,
                align: 'end' as const,
                labels: {
                    usePointStyle: true,
                    boxWidth: 8,
                    font: { size: 11, family: 'Inter' },
                    color: '#64748b'
                }
            },
            tooltip: {
                backgroundColor: '#FFFFFF',
                titleColor: '#0F172A',
                bodyColor: '#475569',
                borderColor: '#E2E8F0',
                borderWidth: 1,
                padding: 12,
                titleFont: { size: 13, weight: 'bold' as const, family: 'Inter' },
                bodyFont: { size: 12, family: 'Inter' },
                displayColors: true,
                callbacks: {
                    label: (context: any) => {
                        const label = context.dataset.label || '';
                        const value = context.parsed.y;
                        return `${label}: AED ${value.toLocaleString()}`;
                    },
                }
            },
        },
        scales: {
            x: {
                grid: { display: false },
                ticks: { color: '#94a3b8', font: { size: 11 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 12 }
            },
            y: {
                type: 'linear' as const,
                display: true,
                position: 'left' as const,
                grid: { color: '#f1f5f9', borderDash: [4, 4] },
                ticks: {
                    color: '#94a3b8',
                    font: { size: 11 },
                    callback: (val: any) => `AED ${val >= 1000 ? val / 1000 + 'k' : val}`
                },
                min: 0,
            },
        },
    };

    if (!data || data.length === 0) {
        return (
            <div className="w-full h-full flex flex-col items-center justify-center text-slate-400">
                <p className="text-sm">No revenue data available</p>
            </div>
        )
    }

    return <Line data={chartData} options={options} />;
};
