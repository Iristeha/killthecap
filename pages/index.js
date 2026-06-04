import Head from "next/head";
import Script from "next/script";

export default function Home() {
  return (
    <>
      <Head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Spiegel van de Leugen</title>
        <link rel="stylesheet" href="/style.css" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;600&display=swap"
          rel="stylesheet"
        />
      </Head>

      <video id="mirror-video" autoPlay playsInline></video>

      <div id="overlay">
        <div id="overlay-text"></div>
        <div id="sub-text"></div>

        <div id="loading-bar">
          <div id="loading-fill"></div>
        </div>
      </div>

      <Script src="/jsvascript.js" strategy="afterInteractive" />
    </>
  );
}
