import { ChartData, ChartOptions } from "chart.js";
import { Doughnut, Line } from "react-chartjs-2";

interface ChartStatProps {
  firstData: number[];
  secondData: number[];
  title: string;
  currentYear : null;
  lastYear : null;
}
interface MonthChartStatProps {
  firstData: number[];
  secondData: number[];
  title: string;
}

export const YearlyChart: React.FC<ChartStatProps> = ({
  firstData,
  secondData,
  title,
  currentYear= null,
  lastYear=null
}) => {
  const options: ChartOptions<"line"> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      tooltip: {
        enabled: true, // Enable tooltips
        callbacks: {
          label: function (tooltipItem) {
            // Get the value for the tooltip item
            const value = tooltipItem.raw;
            // Format the tooltip with dollar value
            return `${tooltipItem.label}: $${value.toLocaleString()}`;
          },
          title: function (tooltipItem) {
            const datasetIndex = tooltipItem[0]?.datasetIndex;
            const datasetLabel = data.datasets[datasetIndex]?.label;
            return datasetLabel; // Show the label of March or April
          },
        },
        backgroundColor: "rgba(0, 0, 0, 0.7)", // Tooltip background color
        titleColor: "#fff", // Title color
        bodyColor: "#fff", // Body text color
        borderColor: "#141527", // Border color of the tooltip
        borderWidth: 2, // Border width of the tooltip
        padding: 10, // Padding around the tooltip
        displayColors: false, // Hide color boxes
      },
      legend: {
        position: "bottom",
        labels: {
          boxWidth: 12,
          boxHeight: 12,
          padding: 20,
          color: "#e1e8ff",
          borderRadius: 0,
          font: {
            size: 14,
            weight: "normal",
          },
        },
      },
      title: {
        display: true,
        align: "center",
        text: title,
        padding: {
          bottom: 20,
          top: 10,
        },
        font: {
          size: 18,
        },
        color: "#e1e8ff",
      },
    },
    elements: {
      line: {
        tension: 0.42,
        borderWidth: 2,
      },
      point: {
        radius: 6,
        borderWidth: 2,
      },
    },
    scales: {
      y: {
        ticks: {
          maxTicksLimit: 6,
        },
        border: {
          dash: [4, 4],
        },
        grid: {
          color: "rgba(255,255,255,0.1)", // optional
        },
      },
      x: {
        border: {
          dash: [4, 4],
        },
        grid: {
          color: "rgba(255,255,255,0.1)", // optional
        },
      },
    },
  };

  const labels = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];

  const data: ChartData<"line"> = {
    labels,
    datasets: [
      {
        fill: true,
        label: currentYear,
        data: firstData,
        borderColor: "#D20D5C",
        backgroundColor: "rgba(15, 57, 193, 0.3)",
        pointBackgroundColor: "#FFFFFF",
      },
      {
        fill: true,
        label: lastYear,
        data: secondData,
        borderColor: "#053AE7",
        backgroundColor: "rgba(137, 121, 255, 0.3)",
        pointBackgroundColor: "#FFFFFF",
      },
    ],
  };
  return (
    <div className="w-full h-full">
      <Line options={options} data={data} />
    </div>
  );
};

export const MonthlyChart: React.FC<MonthChartStatProps> = ({
  firstData,
  secondData,
  title,
}) => {
  const colors = [
    "rgba(210, 13, 92, 0.3)",
    "rgba(254, 144, 0, 0.3)",
    "rgba(5, 58, 231, 0.3)",
    "rgba(217, 240, 255, 0.3)",
  ];
  const data: ChartData<"doughnut"> = {
    labels: ["7 Days", "14 Days", "21 Days", "Full Month"],
    datasets: [
      {
        label: "March 2025",
        data: firstData,
        backgroundColor: colors,
        borderColor: "#053AE7",
        borderWidth: 1,
        order: 2,
      },
      {
        label: "April 2025",
        data: secondData,
        backgroundColor: colors,
        borderColor: "#D20D5C",
        borderWidth: 3,
        order: 1,
      },
    ],
  };

  const options: ChartOptions<"doughnut"> = {
    plugins: {
      tooltip: {
        enabled: true, // Enable tooltips
        callbacks: {
          label: function (tooltipItem) {
            // Get the value for the tooltip item
            const value = tooltipItem.raw;
            // Format the tooltip with dollar value
            return `${tooltipItem.label}: $${value.toLocaleString()}`;
          },
          title: function (tooltipItem) {
            const datasetIndex = tooltipItem[0]?.datasetIndex;
            const datasetLabel = data.datasets[datasetIndex]?.label;
            return datasetLabel; // Show the label of March or April
          },
        },
        backgroundColor: "rgba(0, 0, 0, 0.7)", // Tooltip background color
        titleColor: "#fff", // Title color
        bodyColor: "#fff", // Body text color
        borderColor: "#141527", // Border color of the tooltip
        borderWidth: 2, // Border width of the tooltip
        padding: 10, // Padding around the tooltip
        displayColors: false, // Hide color boxes
      },
      legend: {
        position: "bottom",
        labels: {
          boxWidth: 12,
          boxHeight: 12,
          padding: 20,
          color: "#e1e8ff",
          borderRadius: 0,
          font: {
            size: 14,
            weight: "normal",
          },
        },
      },
      title: {
        display: true,
        align: "center",
        text: title,
        padding: {
          bottom: 20,
          top: 10,
        },
        font: {
          size: 18,
        },
        color: "#e1e8ff",
      },
    },
    scales: {
      y: {
        ticks: {
          maxTicksLimit: 6,
          display: false,
        },
        border: {
          dash: [4, 4],
        },
        grid: {
          color: "rgba(255,255,255,0.1)", // optional
        },
      },
      x: {
        ticks: {
          maxTicksLimit: 6,
          display: false,
        },
        border: {
          dash: [4, 4],
        },
        grid: {
          color: "rgba(255,255,255,0.1)", // optional
        },
      },
    },
  };
  return <Doughnut data={data} options={options} />;
};
