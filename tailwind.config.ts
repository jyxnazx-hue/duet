import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#FDFBF7", 
        surface: "#F4F1EA",    
        text: "#2D2A26",       
        accent: "#E07A5F",     
        sage: "#81B29A",       
      },
    },
  },
  plugins: [],
};
export default config;