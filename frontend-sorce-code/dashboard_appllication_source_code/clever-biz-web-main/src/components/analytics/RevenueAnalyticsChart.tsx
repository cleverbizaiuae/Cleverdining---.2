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

export const RevenueAnalyticsChart = ({ data, labels, orders, comparisonData, showComparison = true }: any) => {
    // Basic defaults if data is missing (prevent crash)
    const safeLabels = (labels && labels.length > 0) ? labels : ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const safeRevenue = (data && data.length > 0) ? data : Array(safeLabels.length).fill(0);
    const safeOrders = (orders && orders.length > 0) ? orders : Array(safeLabels.length).fill(0);

    const chartData = {
        labels: safeLabels,
        datasets: [
            // 1. Revenue Dataset (Left Axis)
            {
                label: 'Revenue',
                data: safeRevenue,
                borderColor: '#0055FE',
                borderWidth: 2,
                backgroundColor: (context: ScriptableContext<"line">) => {
                    const ctx = context.chart.ctx;
                    const gradient = ctx.createLinearGradient(0, 0, 0, 300);
                    gradient.addColorStop(0, 'rgba(0, 85, 254, 0.15)');
                    gradient.addColorStop(1, 'rgba(0, 85, 254, 0)');
                    return gradient;
                },
                fill: true,
                tension: 0.4,
                pointRadius: 0,
                pointHoverRadius: 6,
                pointHoverBackgroundColor: '#0055FE',
                pointHoverBorderColor: '#FFFFFF',
                pointHoverBorderWidth: 2,
                yAxisID: 'y',
                order: 2
            },
            // 2. Orders Dataset (Right Axis)
            {
                label: 'Orders',
                data: safeOrders,
                borderColor: '#8B5CF6', // Purple-500
                borderWidth: 2,
                borderDash: [0, 0], // Solid line
                backgroundColor: 'transparent',
                pointRadius: 0,
                pointHoverRadius: 6,
                pointHoverBackgroundColor: '#8B5CF6',
                pointHoverBorderColor: '#FFFFFF',
                pointHoverBorderWidth: 2,
                tension: 0.4,
                yAxisID: 'y1', // Secondary Axis
                order: 1 // Top z-index
            },
            // 3. Comparison Revenue (Optional)
            ...(showComparison && comparisonData ? [{
                label: 'Prev. Revenue',
                data: comparisonData,
                borderColor: '#94a3b8',
                borderWidth: 2,
                borderDash: [5, 5],
                backgroundColor: 'transparent',
                pointRadius: 0,
                pointHoverRadius: 4,
                tension: 0.4,
                yAxisID: 'y',
                order: 3
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
                        if (context.dataset.yAxisID === 'y') {
                            return `${label}: AED ${value.toLocaleString()}`;
                        }
                        return `${label}: ${value} orders`;
                    },
                }
            },
        },
        scales: {
            scales: {
                x: {
                    grid: { display: false },
                    ticks: {
                        color: '#94a3b8',
                        font: { size: 11, family: 'Inter' },
                        maxRotation: 0,
                        autoSkip: true,
                        maxTicksLimit: 12
                    }
                },
                y: { // Revenue Axis (Left)
                    type: 'linear' as const,
                    display: true,
                    position: 'left' as const,
                    grid: { color: '#f1f5f9', borderDash: [4, 4] },
                    border: { display: false },
                    ticks: {
                        color: '#64748b',
                        font: { size: 11, family: 'Inter', weight: 500 },
                        padding: 8,
                        callback: (val: any) => `AED ${val >= 1000 ? val / 1000 + 'k' : val}`
                    },
                    beginAtZero: true,
                },
                y1: { // Orders Axis (Right)
                    type: 'linear' as const,
                    display: true,
                    position: 'right' as const,
                    grid: { display: false },
                    border: { display: false },
                    ticks: {
                        color: '#8B5CF6',
                        font: { size: 11, family: 'Inter', weight: 600 },
                        padding: 8,
                        callback: (val: any) => `${val}`
                    },
                    beginAtZero: true,
                    // Ensure orders don't look squashed if numbers are small
                    suggestedMax: safeOrders.length > 0 ? Math.max(...safeOrders) * 1.5 : 5
                },
            },
        },
    };

    return (
        <div className="relative w-full h-full">
            {(!data || data.length === 0) && (!orders || orders.length === 0) && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <p className="text-xs text-slate-400 bg-white/80 px-2 py-1 rounded">No data yet</p>
                </div>
            )}
            <Line data={chartData} options={options} />
        </div>
    );
};
