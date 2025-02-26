const puppeteer = require('puppeteer');
const { MathpixMarkdownModel } = require('mathpix-markdown-it');
const fs = require('fs-extra');

async function tex_to_image(tex)
{
    let browser;
    let latex = tex;
    function val_latex(tex)
    {
        // Buat pesan saja error yang ada
        let kurung_kurawal = 0;
        let array_form = 0;
        let kurung = 0;
        let _err_msg = null;
        
        for (let i = 0; i < tex.length; i++)
        {
            if (tex[i] === '{')
            {
                kurung_kurawal++;
            }
            else if (tex[i] === '}')
            {
                kurung_kurawal--;
                if (kurung_kurawal < 0) 
                {
                    _err_msg = "TeX error: Unexpected close brace";
                    break;
                }
            }
            else if (tex[i] === '[')
            {
                array_form++;
            }
            else if (tex[i] === ']')
            {
                array_form--;
                if (array_form < 0) 
                {
                    _err_msg = "TeX error: Unexpected close bracket";
                    break;
                }
            } 
            else if (tex[i] === '(') 
            {
                kurung++;
            }
            else if (tex[i] === ')')
            {
                kurung--;
                if (kurung < 0)
                {
                    _err_msg = "TeX error: Unexpected close parenthesis";
                    break;
                }
            }
        }
        if (!_err_msg)
        {
            if (kurung_kurawal > 0)
            {
                _err_msg = "TeX error: Missing close brace";
            }
            else if (array_form > 0)
            {
                _err_msg = "TeX error: Missing close bracket";
            } 
            else if (kurung > 0)
            {
                _err_msg = "TeX error: Missing close parenthesis";
            }
        }
        let forge_command_pattern = /\\[a-zA-Z]+[^a-zA-Z{}\s\\]/g;
        if (!_err_msg && forge_command_pattern.test(tex))
        {
            _err_msg = "TeX error: Incomplete LaTeX command";
        }
        



        // Periksa lingkungan (environment)
        let _ENV = new Map();
        let _ENV_BEGIN = /\\begin\{([^}]+)\}/g;
        let _ENV_PATTERN = /\\end\{([^}]+)\}/g;
        let match;

        while ((match = _ENV_BEGIN.exec(tex)) !== null) 
        {
            let envName = match[1];
            if (!_ENV.has(envName)) 
            {
                _ENV.set(envName, 0);
            }
            _ENV.set(envName, _ENV.get(envName) + 1);
        }
        while ((match = _ENV_PATTERN.exec(tex)) !== null)
        {
            let envName = match[1];
            if (!_ENV.has(envName))
            {
                _err_msg = `TeX error: \\end{${envName}} without matching \\begin{${envName}}`;
                break;
            }
            _ENV.set(envName, _ENV.get(envName) - 1);
        }
        if (!_err_msg)
        {
            for (let [envName, count] of _ENV.entries())
            {
                if (count > 0)
                {
                    _err_msg = `TeX error: Missing \\end{${envName}}`;
                    break;
                }
                else if (count < 0)
                {
                    _err_msg = `TeX error: Too many \\end{${envName}} tags`;
                    break;
                }
            }
        }
        

        
        /*
        * periksa, apakah ada tanda backslash ganda
        * misalnya \\\(x), nanti bakal muncul error
        * pesan error lihat variabel _err_msg dibawah
        */
        if (!_err_msg && /\\\\[^\\[\]{}$ \t\n]/.test(tex))
        {
            _err_msg = "TeX error: Invalid double backslash usage";
        }    
        return {
            isValid: !_err_msg,
            error: _err_msg
        };
    }
    


    /*
    * Ini fungsi buat cetak pesan error
    * misalnya user salah ketik syntax
    * nanti pesan bakal muncul di Command Line
    * terus disimpan ke file err.txt
    * Tampilan error contohnya kek gini
    * 
    * [TexConvert] ERROR=> {
    *        "message": "TeX error: Incomplete LaTeX command",
    *        "latex": "\\\\begin{aligned}\n\\\\g(x) &= \\\\sin(x) \\\\cdot \\\\cos(x) \\\\\\\\\n\\\\g'(x) &= \\\\cos^2(x) - \\\\sin^2(x) \\\\\\\\\n\\\\&= \\\\cos(2x)\n\\\\end{aligned}"
    * }
    * 
    */
    async function log_error(msg, tex_syntax)
    {
        let errorObj = {
            message: msg,
            latex: tex_syntax
        };
        let error_msg = `[TexConvert] ERROR=> ${JSON.stringify(errorObj, null, 2)}`;
        console.error(error_msg);
        
        
        // Tulis error ke file
        await fs.writeFile('./err.txt', error_msg, 'utf8').catch(err => console.error('Error while write to file log:', err));
        
        
        
        /*
        * Nanti misal kalo kita run 2 kali
        * nanti file tex.jpg akan otomatis ter-update
        * jadi gk perlu hapus manual
        */
        if (await fs.pathExists('./tex.jpg'))
        {
            await fs.remove('./tex.jpg').catch(err => console.error('Error while delete file tex.jpg:', err));
        }
    }
    


    
    /*
    * Validasi LaTeX
    * Jika error, nanti pesannya akan otomatis
    * masuk ke dalam err.txt
    */
    let validation = val_latex(latex);
    if (!validation.isValid)
    {
        await log_error(validation.error, latex);
        return;
    }
    



    try
    {

        // Opsi rendering
        let options = {
            htmlTags: true,
            width: 800
        };

        
        
        /* 
        * Render LaTeX ke HTML menggunakan Mathpix
        * nanti sudah tidak perlu lagi pakai $$
        * pada aligned environment
        */
        let html = MathpixMarkdownModel.render(latex, options);
        


        
        /* 
        * Buat deteksi error rendering sesuai output
        */
        if (html.includes('class="error"') || html.includes('data-error') || html.includes('class="katex-error"') || html.includes('class="error-message"'))
        {
            await log_error("TeX error: Rendering failed", latex);
            return;
        }

        
        
        /*
        * ini bagian buat halaman nanti
        * Ukuran font, tampilan bisa disesuaikan
        */
        let full_html = `
    <html>
    <head>
        <style>
            body { 
                font-family: Arial, sans-serif; 
                background-color: white; 
                display: flex; 
                justify-content: center; 
                align-items: center; 
                height: 100vh; 
                margin: 0;
            }
            .container {
                width: 1440px;
                height: 1440px;
                background-color: white;
                display: flex;
                justify-content: center;
                align-items: center;
            }
            .math-content { 
                display: inline-block;
                background-color: white;
                text-align: center;
                font-size: 24px;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="math-content">${html}</div>
        </div>
    </body>
    </html>`;



        /* 
        * Sama sih, tapi ya bisa lah, kali aja syntaxnya error
        * atau mungkin kegagalan pada blok if
        */
        if (await fs.pathExists('./tex.jpg'))
        {
            await fs.remove('./tex.jpg');
        }




        /* 
        * Tulis HTML ke file sementara 
        * Nanti kalo hasilnya muncul di file tex.jpg
        * file temp.html nantinya juga akan otomatis hilang 
        */
        let __path = 'temp.html';
        await fs.writeFile(__path, full_html, 'utf8');




        // Buka browser / new page
        browser = await puppeteer.launch();
        let page = await browser.newPage();

        



        /* 
        * Set viewport sama HTML 
        * Untuk ukuran, 1:1, bisa disesuaikan sendiri
        * 
        * {
        *    width: 720
        *    height: 720
        * }
        */
        await page.setViewport(
        {
            width: 1440, 
            height: 1440 
        });
        await page.setContent(full_html, { waitUntil: 'domcontentloaded' });
        




        /* 
        * Ambil screenshot
        * Hasil ada di dalam folder luar / root
        */
        await page.screenshot(
        {
            path: 'tex.jpg',
            type: 'jpeg',
            quality: 100,
            clip: {
                x: 360,
                y: 360, 
                width: 720, 
                height: 720
            }
        });
        await fs.remove(__path);
    }
    catch (e)
    {
        await log_error(e.message, latex);
    }
    finally
    {
        if (browser)
        {
            await browser.close().catch(err => console.error('Error while close browser:', err));
        }
    }
}
// Nih sample contoh
tex_to_image(
    `
\\begin{aligned}
\\text {Ngitung turunan fungsi}
\\end{aligned}

\\begin{aligned}
\\\\
f(x) &= \\frac{3x + 5}{x - 2} 
\\\\
f(x) &= \\frac{u}{v} \\Rightarrow f'(x) = \\frac{u'.v - u.v'}{v^2}
\\\\
&= \\frac{3.(x - 2) - (3x + 5).1}{(x - 2)^2}
\\\\
&= \\frac{3x - 6 - 3x - 5}{(x - 2)^2}
\\\\
f'(x) &= \\frac{-11}{(x - 2)^2}
\\\\
f'(1) = \\frac{-11}{(1 - 2)^2}
\\\\         &= \\frac{-11}{1}
\\\\
f'(1) = -11
\\end{aligned}`
)