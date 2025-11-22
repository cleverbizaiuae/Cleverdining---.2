import React from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  BarController, // <-- add this
  LineController, // <-- add this
  Title,
  Tooltip,
  Legend,
  ChartOptions,
  ChartData,
} from "chart.js";
import { Chart } from "react-chartjs-2";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  BarController, // <-- register BarController
  LineController, // <-- register LineController
  Title,
  Tooltip,
  Legend
);

// Utility: Convert month number (1-12) to month name
// const monthNumberToName = (monthNumber: number) => {
//   const months = [
//     "January",
//     "February",
//     "March",
//     "April",
//     "May",
//     "June",
//     "July",
//     "August",
//     "September",
//     "October",
//     "November",
//     "December",
//   ];
//   return months[monthNumber - 1] || "";
// };

type DailyReportProps = {
  productsSold: number[]; // number of products per day
  salesAmount: number[]; // revenue per day
  month: string; // 1-12
  year: number; // e.g., 2025
};

export const DailyReportChart: React.FC<DailyReportProps> = ({
  productsSold,
  salesAmount,
  month,
  // year,
}) => {
  const labels = productsSold.map((_, i) => `Day ${i + 1}`);

  const data: ChartData<"bar" | "line"> = {
    labels,
    datasets: [
      {
        type: "bar" as const,
        label: "Products Sold",
        data: productsSold,
        backgroundColor: "rgba(210, 13, 92, 0.6)",
        yAxisID: "yProducts",
      },
      {
        type: "line" as const,
        label: "Sales Amount ($)",
        data: salesAmount,
        borderColor: "#053AE7",
        backgroundColor: "rgba(5, 58, 231, 0.3)",
        yAxisID: "ySales",
      },
    ],
  };

  const options: ChartOptions<"bar" | "line"> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      tooltip: {
        callbacks: {
          label: function (tooltipItem) {
            const datasetLabel = tooltipItem.dataset.label || "";
            const value = tooltipItem.raw as number;
            if (datasetLabel.includes("Sales")) {
              return `${datasetLabel}: $${value.toLocaleString()}`;
            }
            return `${datasetLabel}: ${value}`;
          },
        },
      },
      legend: {
        position: "bottom",
        labels: { color: "#e1e8ff" },
      },
      title: {
        display: true,
        text: `Daily Sales Report - ${month}`,
        color: "#e1e8ff",
        font: { size: 18 },
      },
    },
    scales: {
      yProducts: {
        type: "linear",
        position: "left",
        title: { display: true, text: "Products Sold", color: "#e1e8ff" },
        grid: { color: "rgba(255,255,255,0.1)" },
        ticks: { color: "#e1e8ff" },
      },
      ySales: {
        type: "linear",
        position: "right",
        title: { display: true, text: "Sales Amount ($)", color: "#e1e8ff" },
        grid: { drawOnChartArea: false },
        ticks: { color: "#e1e8ff" },
      },
      x: {
        grid: { color: "rgba(255,255,255,0.1)" },
        ticks: { color: "#e1e8ff" },
      },
    },
  };

  return (
    <div className="w-full h-96">
      <Chart type="bar" options={options} data={data} />
    </div>
  );
};
