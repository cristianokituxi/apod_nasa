 let buscarButton = document.querySelector("#procurar")
 var data1 = document.querySelector("#buscar")



 document.addEventListener("click",() =>{
console.log("button pressed");
    sendApiRequest()
})     



async function  sendApiRequest(){
    let API_KEY = "wV5LgKKcbI8hsCJ81GcYxVTZT2HnX32qCY721zSQ"
    let response = await fetch("https://api.nasa.gov/planetary/apod?api_key="+ API_KEY);
     console.log(response)
    let data = await response.json()
    console.log(data)
   useApiData(data)
}
    

function useApiData(data){
document.querySelector("#content").innerHTML += data.explanation
document.querySelector("#content").innerHTML += `<img src="${data.url}">` 
}