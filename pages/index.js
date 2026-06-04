import Head from "next/head";
import Script from "next/script";
import Link from "next/link";
import { useState } from "react";

export default function Home() {
  const [started, setStarted] = useState(false);

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

      {!started ? (
        <main className="start-screen">
          <h1>Spiegel van de Leugen</h1>
          <p>Welkom — kies een optie om te beginnen.</p>
          <div className="start-actions">
            <Link href="/test">
              <a className="btn">Open Testscherm</a>
            </Link>
            <button className="btn primary" onClick={() => setStarted(true)}>
              Start App
            </button>
          </div>
        </main>
      ) : (
        <>
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
      )}
    </>
  );
}
