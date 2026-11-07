"use client";

import { useState } from "react";
import { Icon } from "./icons";

export function UserGuide({ onDocuments, onDemo, onQuestion, busy, demoOnly, temporary = false, readOnlyDemo = false, maxPdfMb = 12 }: {
  onDocuments: () => void;
  onDemo: () => void;
  onQuestion: (question: string) => void;
  busy: boolean;
  demoOnly: boolean;
  temporary?: boolean;
  readOnlyDemo?: boolean;
  maxPdfMb?: number;
}) {
  const [hebrew, setHebrew] = useState(false);
  const examples = [
    "What changed in the coverage and exclusions?",
    "What changed in the claim reporting deadline?",
    "Did the deductible change between these editions?",
    "What changed in section 4.2.1?",
  ];
  const labels = hebrew
    ? ["מה השתנה בכיסויים ובחריגים?", "מה השתנה במועד הדיווח על תביעה?", "האם השתנתה ההשתתפות העצמית?", "מה השתנה בסעיף מסוים?"]
    : examples;

  return <section className="panel user-guide" aria-labelledby="guide-heading">
    <div className="section-head">
      <div><h2 id="guide-heading">{hebrew ? "איך משווים שני מסמכים?" : "Your first policy comparison"}</h2>
        <p className="muted">{hebrew ? "שלושה שלבים מהעלאה ועד בדיקת המקור." : "Three steps from your PDFs to the original source."}</p></div>
      <button className="button secondary" type="button" onClick={() => setHebrew(!hebrew)} lang={hebrew ? "en" : "he"}>
        {hebrew ? "English" : "עברית"}
      </button>
    </div>
    <div dir={hebrew ? "rtl" : "ltr"} lang={hebrew ? "he" : "en"}>
      <ol className="guide-steps">
        <li><span className="guide-number">1</span><div>
          <h3>{hebrew ? "מעלים את שתי הגרסאות" : "Add your two editions"}</h3>
          <p>{hebrew ? <>פתחו את <bdi>Documents</bdi> ובחרו <bdi>Add a PDF edition</bdi>. למסמך הראשון צרו פוליסה חדשה והגדירו שם גרסה ותאריך. בהעלאת המסמך השני בחרו את אותה פוליסה, והוסיפו שם גרסה אחר ואת התאריך המתאים.</>
            : <>Open <b>Documents</b> and choose <b>Add a PDF edition</b>. Create a new policy for the first PDF, with an edition name and effective date. For the second PDF, select that same policy and use a different edition name and the appropriate date.</>}</p>
          <p className="muted">{hebrew ? <>המתינו עד ששתי הגרסאות מסומנות <bdi>ready</bdi>. אם מופיעה שגיאה, תקנו את הבעיה ובחרו <bdi>Retry ingestion</bdi>.</>
            : <>Wait until both editions show <b>ready</b>. If indexing fails, follow the error message and choose <b>Retry ingestion</b>.</>}</p>
        </div></li>
        <li><span className="guide-number">2</span><div>
          <h3>{hebrew ? "בוחרים זוג מסמכים ושואלים" : "Choose the pair and ask a question"}</h3>
          <p>{hebrew ? <>חזרו ל־<bdi>Compare</bdi>, בחרו את הגרסה הישנה ואז את החדשה. שאלו על נושא או מספר סעיף, בחרו מצב ניתוח ולחצו <bdi>Compare editions</bdi>.</>
            : <>In <b>Compare</b>, select the older edition first, then the newer one. Ask about a topic or section number, choose an analysis mode and select <b>Compare editions</b>.</>}</p>
          <p className="muted">{hebrew ? "השוואה מקומית מציגה שינויי נוסח. ClauseLens מוסיף הסבר AI כשאפשרות זו זמינה. שאלות באנגלית או עם מספר סעיף נותנות בדרך כלל תוצאות מדויקות יותר."
            : "Local wording comparison shows textual changes. ClauseLens adds an AI explanation when available. English questions and explicit section numbers usually give more precise results."}</p>
        </div></li>
        <li><span className="guide-number">3</span><div>
          <h3>{hebrew ? "בודקים את הממצאים מול המקור" : "Check each finding against its sources"}</h3>
          <p>{hebrew ? <>קראו את הנוסח הישן והחדש. קישור <bdi>Preview older/newer PDF</bdi> פותח את עמוד המקור. אפשר להרחיב <bdi>More wording</bdi> כדי לראות את המשך הסעיף.</>
            : <>Read the older and newer wording. Each <b>Preview older/newer PDF</b> link opens its source page. Expand <b>More wording</b> to read the rest of the section.</>}</p>
          <p className="muted">{hebrew ? <>ממצא <bdi>Needs review</bdi> דורש בדיקה ידנית. סעיף שלא נמצא אינו הוכחה להסרתו. סעיפים שנבדקו ונמצאו זהים מופיעים בנפרד, וניתן לפתוח השוואות קודמות ב־<bdi>History</bdi>.</>
            : <>A <b>Needs review</b> finding needs a manual check. A section missing from search is insufficient proof of removal. Checked, unchanged sections appear separately. Reopen previous comparisons in <b>History</b>.</>}</p>
          <p className="muted">{hebrew ? <>לחצו <bdi>Copy</bdi> ליד כותרת התוצאות כדי להעתיק את ההשוואה המלאה, כולל המקורות. ליד כל ממצא וליד הסבר <bdi>ClauseLens</bdi> יש כפתור להעתקה נפרדת. ההודעה <bdi>Copied!</bdi> מאשרת שהטקסט הועתק.</>
            : <>Use <b>Copy</b> beside the results heading to copy the complete comparison with its sources. Each finding and ClauseLens explanation also has its own Copy button. <b>Copied!</b> confirms the text is on your clipboard.</>}</p>
        </div></li>
      </ol>
      <div className="guide-actions">
        {!demoOnly && <button className="button primary" type="button" onClick={onDocuments} disabled={busy}>
          <Icon name="upload" />{hebrew ? "העלאת המסמכים שלי" : "Add my PDFs"}
        </button>}
        <button className="button secondary" type="button" onClick={onDemo} disabled={busy}>
          <Icon name="document" />{hebrew ? "ניסיון עם מסמכי הדמו" : "Try the OAP 1 demo"}
        </button>
      </div>
      <div className="guide-examples">
        <h3>{hebrew ? "אפשר להתחיל מאחת השאלות האלה" : "Start with a question"}</h3>
        <p className="muted">{hebrew ? "בחירה בשאלה תעביר אתכם למסך ההשוואה ותמלא אותה באנגלית." : "Choose one to fill the comparison question."}</p>
        <div>{examples.map((question, index) => <button className="button secondary" key={question} type="button"
          disabled={busy || readOnlyDemo} onClick={() => onQuestion(question)}>{labels[index]}<Icon name="arrow" /></button>)}</div>
      </div>
      <div className="guide-notes">
        <h3>{hebrew ? "לפני ההעלאה" : "Before you upload"}</h3>
        <ul>
          <li>{hebrew ? "העלו שתי גרסאות של אותה פוליסה. השתמשו ב־PDF עם טקסט שאפשר לסמן ולהעתיק. מסמך סרוק ללא שכבת טקסט דורש OCR לפני ההעלאה."
            : "Use two editions of the same policy and PDFs with selectable text. A scanned PDF needs OCR before upload."}</li>
          <li>{hebrew ? `המגבלה היא ${maxPdfMb} MB ו־160 עמודים למסמך. הקובץ צריך להיות תקין וללא הגנת סיסמה.`
            : `Each PDF can be up to ${maxPdfMb} MB and 160 pages. Use a valid file that opens without a password.`}</li>
          <li>{hebrew ? "כל השוואה מכסה עד עשרה סעיפים מותאמים. בדקו את העמודים שמצורפים לממצא, במיוחד כשמופיע הסבר AI."
            : "Each comparison covers up to ten matched sections. Inspect the cited pages, particularly when reviewing an AI explanation."}</li>
          <li>{temporary
            ? (hebrew ? "זוהי סביבת עבודה זמנית. שמרו אצלכם את המסמכים המקוריים והתוצאות שתרצו לשמור. הנתונים אינם ארכיון קבוע."
              : "This is a temporary workspace. Keep your original PDFs and any results you need. It is not a permanent archive.")
            : (hebrew ? "המסמכים ותוצאות ההשוואה נשמרים בסביבת העבודה הזאת וניתנים לפתיחה חוזרת דרך Documents ו־History."
              : "Documents and comparisons are stored in this workspace and can be reopened in Documents and History.")}</li>
          {temporary && <li>{hebrew ? "סביבת העבודה הזמנית מוגבלת לשני מסמכים ולעשר השוואות, ופגה אחרי שעה ללא פעילות. אפשר למחוק את הנתונים דרך Clear my workspace."
            : "A temporary workspace holds two PDFs and up to ten comparisons, and expires after one hour of inactivity. Use Clear my workspace to delete your data."}</li>}
          <li>{hebrew ? "בחירת ClauseLens שולחת את השאלה ואת הטקסט הרלוונטי ל־OpenRouter ולספק המודל. בדקו שהמסמכים מתאימים לשירות חיצוני לפני בחירה במצב זה."
            : "ClauseLens sends your question and relevant text through OpenRouter to its model provider. Check that your documents are suitable for an external service before selecting this mode."}</li>
          {demoOnly && <li>{hebrew ? "בסביבת הדמו הזאת אפשר להשוות רק את המסמכים הציבוריים המוכנים מראש."
            : "This demo workspace supports the bundled public documents."}</li>}
          {readOnlyDemo && <li>{hebrew ? "התוצאות בדמו הזה הוכנו מראש. העלאת מסמכים אישיים ושאלות נוספות ממתינות להשלמת החיבור למסד הנתונים."
            : "Results in this preview are prepared examples. Personal uploads and additional questions are awaiting database configuration."}</li>}
        </ul>
      </div>
    </div>
  </section>;
}

