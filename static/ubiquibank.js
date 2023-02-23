(function () {

    let detailsVisible = false;
    const table = document.getElementsByTagName(`table`)[0];
    document.getElementById(`additionalDetails`).addEventListener(`click`, function () {
        detailsVisible = !detailsVisible;
        table.setAttribute(`data-details-visible`, detailsVisible.toString())
    });

})();