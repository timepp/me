import {api} from '../api.ts'

async function main() {
    const networkInfo = await api.getNetworkInfo('')
    console.log(networkInfo)

    // create a table to display network info
    const table = document.createElement('table')
    document.body.appendChild(table)
    table.style.border = '1px solid black'
    table.style.borderCollapse = 'collapse'
    table.style.width = '100%'

    // create table header
    const thead = document.createElement('thead')
    table.appendChild(thead)
    const tr = document.createElement('tr')
    thead.appendChild(tr)
    const headers = ['Name', 'Family', 'Address', 'Netmask', 'Scopeid', 'Cidr', 'Mac']
    headers.forEach(header => {
        const th = document.createElement('th')
        th.textContent = header
        tr.appendChild(th)
    })

    // create table body
    const tbody = document.createElement('tbody')
    table.appendChild(tbody)
    networkInfo.forEach(ni => {
        const tr = document.createElement('tr')
        tbody.appendChild(tr)
        const values = [ni.name, ni.family, ni.address, ni.netmask, ni.scopeid, ni.cidr, ni.mac]
        values.forEach(value => {
            const td = document.createElement('td')
            td.textContent = (value || '').toString()
            tr.appendChild(td)
        })
    })
}

document.addEventListener('DOMContentLoaded', function() {
    main();
}, false);

